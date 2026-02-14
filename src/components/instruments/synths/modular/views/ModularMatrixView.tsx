/**
 * ModularMatrixView - Table/matrix-based connection editor
 *
 * Features:
 * - Rows = input ports (one per module input)
 * - Columns = output ports (one per module output)
 * - Cell click = connect/disconnect
 * - Amount slider for CV connections
 * - Selected module's parameters in sidebar
 * - Compact, tracker-aesthetic layout
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { ModularPatchConfig, ModularConnection } from '../../../../../types/modular';
import { ModuleRegistry } from '../../../../../engine/modular/ModuleRegistry';
import { Knob } from '../../../../controls/Knob';

interface ModularMatrixViewProps {
  config: ModularPatchConfig;
  onChange: (config: ModularPatchConfig) => void;
}

interface PortInfo {
  moduleId: string;
  moduleName: string;
  portId: string;
  portName: string;
  signal: string;
  color: string;
}

export const ModularMatrixView: React.FC<ModularMatrixViewProps> = ({ config, onChange }) => {
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  // Build lists of all input and output ports
  const { inputPorts, outputPorts } = useMemo(() => {
    const inputs: PortInfo[] = [];
    const outputs: PortInfo[] = [];

    config.modules.forEach((module) => {
      const descriptor = ModuleRegistry.get(module.descriptorId);
      if (!descriptor) return;

      descriptor.ports.forEach((port) => {
        const portInfo: PortInfo = {
          moduleId: module.id,
          moduleName: module.label || descriptor.name,
          portId: port.id,
          portName: port.name,
          signal: port.signal,
          color: getSignalColor(port.signal),
        };

        if (port.direction === 'input') {
          inputs.push(portInfo);
        } else {
          outputs.push(portInfo);
        }
      });
    });

    return { inputPorts: inputs, outputPorts: outputs };
  }, [config.modules]);

  // Find connection for a given input/output pair
  const findConnection = useCallback(
    (inputPort: PortInfo, outputPort: PortInfo): ModularConnection | null => {
      return (
        config.connections.find(
          (conn) =>
            conn.source.moduleId === outputPort.moduleId &&
            conn.source.portId === outputPort.portId &&
            conn.target.moduleId === inputPort.moduleId &&
            conn.target.portId === inputPort.portId
        ) || null
      );
    },
    [config.connections]
  );

  // Toggle connection
  const handleCellClick = useCallback(
    (inputPort: PortInfo, outputPort: PortInfo) => {
      const existing = findConnection(inputPort, outputPort);

      if (existing) {
        // Remove connection
        const updatedConnections = config.connections.filter((c) => c.id !== existing.id);
        onChange({ ...config, connections: updatedConnections });
      } else {
        // Add connection
        const newConnection: ModularConnection = {
          id: `conn_${Date.now()}`,
          source: { moduleId: outputPort.moduleId, portId: outputPort.portId },
          target: { moduleId: inputPort.moduleId, portId: inputPort.portId },
          amount: 1,
        };
        onChange({ ...config, connections: [...config.connections, newConnection] });
      }
    },
    [config, onChange, findConnection]
  );

  // Update connection amount
  const handleAmountChange = useCallback(
    (connection: ModularConnection, amount: number) => {
      const updatedConnections = config.connections.map((c) =>
        c.id === connection.id ? { ...c, amount } : c
      );
      onChange({ ...config, connections: updatedConnections });
    },
    [config, onChange]
  );

  // Module parameter change
  const handleParameterChange = useCallback(
    (moduleId: string, paramId: string, value: number) => {
      const updatedModules = config.modules.map((m) =>
        m.id === moduleId ? { ...m, parameters: { ...m.parameters, [paramId]: value } } : m
      );
      onChange({ ...config, modules: updatedModules });
    },
    [config, onChange]
  );

  // Selected module
  const selectedModule = useMemo(() => {
    if (!selectedModuleId) return null;
    return config.modules.find((m) => m.id === selectedModuleId) || null;
  }, [selectedModuleId, config.modules]);

  const selectedDescriptor = useMemo(() => {
    if (!selectedModule) return null;
    return ModuleRegistry.get(selectedModule.descriptorId) || null;
  }, [selectedModule]);

  return (
    <div className="flex h-full bg-surface-primary overflow-hidden">
      {/* Matrix grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-surface-secondary z-10">
            <tr>
              <th className="border border-border p-2 text-left min-w-[120px]">Input \ Output</th>
              {outputPorts.map((output) => (
                <th
                  key={`${output.moduleId}.${output.portId}`}
                  className="border border-border p-2 text-center min-w-[80px] max-w-[120px]"
                >
                  <div className="truncate text-text-secondary">{output.moduleName}</div>
                  <div
                    className="truncate text-text-tertiary mt-1"
                    style={{ color: output.color }}
                  >
                    {output.portName}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inputPorts.map((input) => (
              <tr key={`${input.moduleId}.${input.portId}`} className="hover:bg-surface-tertiary/30">
                <td className="border border-border p-2 sticky left-0 bg-surface-secondary">
                  <div className="truncate text-text-secondary">{input.moduleName}</div>
                  <div className="truncate text-text-tertiary mt-1" style={{ color: input.color }}>
                    {input.portName}
                  </div>
                </td>
                {outputPorts.map((output) => {
                  const connection = findConnection(input, output);
                  const isConnected = !!connection;

                  return (
                    <td
                      key={`${output.moduleId}.${output.portId}`}
                      className={`
                        border border-border p-1 text-center cursor-pointer
                        ${isConnected ? 'bg-accent-primary/20' : 'bg-surface-primary'}
                        hover:bg-accent-primary/30 transition-colors
                      `}
                      onClick={() => handleCellClick(input, output)}
                    >
                      {isConnected && (
                        <div className="flex items-center justify-center gap-1">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: output.color }}
                          />
                          {/* Amount slider for CV connections */}
                          {(input.signal === 'cv' || output.signal === 'cv') && connection && (
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={connection.amount}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleAmountChange(connection, parseFloat(e.target.value));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-12 h-1"
                            />
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Empty state */}
        {config.modules.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-tertiary">
            <p className="text-sm">No modules yet. Click "Add Module" to get started.</p>
          </div>
        )}

        {/* No ports state */}
        {config.modules.length > 0 && inputPorts.length === 0 && outputPorts.length === 0 && (
          <div className="flex items-center justify-center h-full text-text-tertiary">
            <p className="text-sm">No ports available. Add modules with inputs/outputs.</p>
          </div>
        )}
      </div>

      {/* Sidebar - Module parameters */}
      <div className="w-64 border-l border-border bg-surface-secondary overflow-y-auto">
        <div className="p-4">
          <h3 className="text-sm font-medium text-text-primary mb-4">Module Parameters</h3>

          {/* Module selector */}
          <select
            value={selectedModuleId || ''}
            onChange={(e) => setSelectedModuleId(e.target.value || null)}
            className="w-full px-2 py-1.5 mb-4 bg-surface-primary border border-border rounded text-sm text-text-primary"
          >
            <option value="">Select module...</option>
            {config.modules.map((module) => {
              const descriptor = ModuleRegistry.get(module.descriptorId);
              return (
                <option key={module.id} value={module.id}>
                  {module.label || descriptor?.name || module.id}
                </option>
              );
            })}
          </select>

          {/* Parameters */}
          {selectedModule && selectedDescriptor && (
            <div className="space-y-4">
              {selectedDescriptor.parameters.length === 0 && (
                <p className="text-xs text-text-tertiary">No parameters available.</p>
              )}

              {selectedDescriptor.parameters.map((param) => (
                <div key={param.id} className="flex flex-col items-center gap-2">
                  <Knob
                    value={selectedModule.parameters[param.id] ?? param.default}
                    min={param.min}
                    max={param.max}
                    onChange={(value) => handleParameterChange(selectedModule.id, param.id, value)}
                    size="sm"
                    label={param.name}
                  />
                  <div className="text-xs text-text-tertiary">
                    {(selectedModule.parameters[param.id] ?? param.default).toFixed(2)}
                    {param.unit && ` ${param.unit}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Get color for signal type
 */
function getSignalColor(signal: string): string {
  switch (signal) {
    case 'audio':
      return '#10b981'; // green
    case 'cv':
      return '#eab308'; // yellow
    case 'gate':
      return '#ef4444'; // red
    case 'trigger':
      return '#3b82f6'; // blue
    default:
      return '#6b7280'; // gray
  }
}
