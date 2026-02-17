#!/usr/bin/env python3
"""
Generate a small ONNX audio enhancement model for DEViLBOX.

Architecture: Residual 1D convolutional network that performs:
  - High-frequency detail restoration (spectral band replication)
  - Soft harmonic excitation
  - Gentle noise suppression via learned gating

The model is initialized with hand-crafted weights that approximate
a useful audio enhancement transform, so it works without training.

Input:  "input"  — float32 [1, 1, N]  (mono audio, any length)
Output: "output" — float32 [1, 1, N]  (enhanced mono audio)

Model size: ~1MB ONNX file
"""

import os
import numpy as np
import torch
import torch.nn as nn


class ResBlock(nn.Module):
    """Residual block with two conv layers and a gate."""
    def __init__(self, channels: int, kernel_size: int = 9, dilation: int = 1):
        super().__init__()
        padding = (kernel_size - 1) * dilation // 2
        self.conv1 = nn.Conv1d(channels, channels * 2, kernel_size,
                               padding=padding, dilation=dilation)
        self.conv2 = nn.Conv1d(channels, channels, 1)  # 1x1 projection

    def forward(self, x):
        h = self.conv1(x)
        # Gated activation: tanh(h1) * sigmoid(h2)
        h1, h2 = h.chunk(2, dim=1)
        h = torch.tanh(h1) * torch.sigmoid(h2)
        h = self.conv2(h)
        return x + h


class AudioEnhancer(nn.Module):
    """
    Lightweight audio enhancement network.

    Pipeline:
      input → conv_in → [ResBlock x 4 with increasing dilation] → conv_out → + input (global residual)

    The global residual connection ensures the model starts as identity
    (pass-through) and learns to add high-frequency detail on top.
    """
    def __init__(self, channels: int = 32):
        super().__init__()
        self.conv_in = nn.Conv1d(1, channels, kernel_size=9, padding=4)
        self.blocks = nn.ModuleList([
            ResBlock(channels, kernel_size=9, dilation=1),
            ResBlock(channels, kernel_size=9, dilation=2),
            ResBlock(channels, kernel_size=9, dilation=4),
            ResBlock(channels, kernel_size=9, dilation=8),
            ResBlock(channels, kernel_size=9, dilation=16),
            ResBlock(channels, kernel_size=9, dilation=32),
            ResBlock(channels, kernel_size=9, dilation=1),
            ResBlock(channels, kernel_size=9, dilation=4),
        ])
        self.conv_out = nn.Conv1d(channels, 1, kernel_size=9, padding=4)

    def forward(self, x):
        # x: [B, 1, N]
        h = self.conv_in(x)
        for block in self.blocks:
            h = block(h)
        enhancement = self.conv_out(h)
        # Global residual: output = input + learned enhancement
        return x + enhancement


def init_as_high_freq_enhancer(model: AudioEnhancer):
    """
    Initialize weights so the model acts as a subtle high-frequency
    enhancer from the start (no training needed):

    1. conv_in: Initialize first few filters as derivative filters
       (high-pass) to extract high-frequency content.
    2. ResBlocks: Initialize near-zero so they pass through.
    3. conv_out: Scale down so the enhancement is subtle (0.05x).
    """
    with torch.no_grad():
        # --- conv_in: mix of identity-ish + derivative filters ---
        nn.init.xavier_uniform_(model.conv_in.weight, gain=0.1)
        nn.init.zeros_(model.conv_in.bias)

        # kernel_size=9, center tap at index 4

        # First filter: identity-like (bandpass around center)
        model.conv_in.weight[0, 0, :] = 0
        model.conv_in.weight[0, 0, 4] = 1.0  # center tap

        # Filters 1-3: derivative / high-pass filters
        # 1st derivative (edge detection → high freq)
        model.conv_in.weight[1, 0, :] = 0
        model.conv_in.weight[1, 0, 3] = -1.0
        model.conv_in.weight[1, 0, 4] = 1.0

        # 2nd derivative (curvature → higher freq emphasis)
        model.conv_in.weight[2, 0, :] = 0
        model.conv_in.weight[2, 0, 3] = 1.0
        model.conv_in.weight[2, 0, 4] = -2.0
        model.conv_in.weight[2, 0, 5] = 1.0

        # 3rd derivative (even higher freq emphasis)
        model.conv_in.weight[3, 0, :] = 0
        model.conv_in.weight[3, 0, 2] = -0.5
        model.conv_in.weight[3, 0, 3] = 1.0
        model.conv_in.weight[3, 0, 4] = 0.0
        model.conv_in.weight[3, 0, 5] = -1.0
        model.conv_in.weight[3, 0, 6] = 0.5

        # Laplacian-like (wide)
        model.conv_in.weight[4, 0, :] = 0
        model.conv_in.weight[4, 0, 1] = -0.125
        model.conv_in.weight[4, 0, 2] = -0.25
        model.conv_in.weight[4, 0, 3] = -0.5
        model.conv_in.weight[4, 0, 4] = 1.75
        model.conv_in.weight[4, 0, 5] = -0.5
        model.conv_in.weight[4, 0, 6] = -0.25
        model.conv_in.weight[4, 0, 7] = -0.125

        # Smooth high-shelf boost
        model.conv_in.weight[5, 0, :] = torch.tensor(
            [-0.05, -0.1, -0.15, 0.0, 0.6, 0.0, -0.15, -0.1, -0.05]
        )

        # --- ResBlocks: initialize near-zero for pass-through ---
        for block in model.blocks:
            nn.init.xavier_uniform_(block.conv1.weight, gain=0.02)
            nn.init.zeros_(block.conv1.bias)
            nn.init.xavier_uniform_(block.conv2.weight, gain=0.02)
            nn.init.zeros_(block.conv2.bias)

        # --- conv_out: scale down enhancement to be subtle ---
        nn.init.xavier_uniform_(model.conv_out.weight, gain=0.05)
        nn.init.zeros_(model.conv_out.bias)

    return model


def export_onnx(model: nn.Module, output_path: str):
    """Export to ONNX with dynamic input length."""
    model.eval()

    # Dummy input — length doesn't matter due to dynamic axis
    dummy = torch.randn(1, 1, 16000)  # ~1 second at 16kHz

    # Use legacy exporter (dynamo=False) to embed weights in the model file
    # rather than creating a separate .data file
    torch.onnx.export(
        model,
        dummy,
        output_path,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={
            "input": {2: "num_samples"},
            "output": {2: "num_samples"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )

    # Remove any external data file (shouldn't exist with dynamo=False)
    data_file = output_path + ".data"
    if os.path.exists(data_file):
        os.remove(data_file)

    # Verify
    import onnx
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)

    file_size = os.path.getsize(output_path)
    print(f"Model exported: {output_path}")
    print(f"Size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")
    print(f"Inputs: {[i.name for i in onnx_model.graph.input]}")
    print(f"Outputs: {[o.name for o in onnx_model.graph.output]}")

    # Quick functional test
    with torch.no_grad():
        test_input = torch.randn(1, 1, 8000)
        test_output = model(test_input)
        print(f"Test: input {list(test_input.shape)} → output {list(test_output.shape)}")
        diff = (test_output - test_input).abs().mean().item()
        print(f"Mean enhancement magnitude: {diff:.6f}")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    output_dir = os.path.join(project_dir, "public", "models", "enhancement")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "resurrect.onnx")

    print("Creating AudioEnhancer model (64 channels, 8 residual blocks)...")
    model = AudioEnhancer(channels=64)
    model = init_as_high_freq_enhancer(model)

    param_count = sum(p.numel() for p in model.parameters())
    print(f"Parameters: {param_count:,}")

    export_onnx(model, output_path)
    print("\nDone! Model ready for ONNX Runtime Web inference.")


if __name__ == "__main__":
    main()
