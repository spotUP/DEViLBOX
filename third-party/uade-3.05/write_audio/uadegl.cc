#include <algorithm>
#include <cstdio>
#include <cmath>
#include <cstring>
#include <vector>
#include <math.h>

#include "common.h"
#include "uadegl.h"

using std::vector;

namespace uade {
namespace write_audio {
namespace uadegl {

struct line_eq {
	// For calculating line's y coordinate based on the x coordinate,
	// or the vice versa
	float c0;
	float c1;
};

static inline float calc_line_coordinate(const float c,
					 const struct line_eq &eq)
{
	return eq.c0 * c + eq.c1;
}

void draw_line(vector<uint32_t> *fb,
	       int x0, int y0,
	       int x1, int y1,
	       uint32_t color,
	       int width,
	       int height)
{
	CHECK(x0 < x1);
	int dx = x1 - x0;
	int dy = y1 - y0;
	const float fdx = dx;
	const float fdy = dy;
	if (abs(dx) <= abs(dy)) {
		// iterate over y-axis
		const struct line_eq line = {
			.c0 = fdx / fdy,
			.c1 = (fdy * x0 - fdx * y0) / fdy,
		};
		const int sign = copysignf(1.0f, dy);
		for (int y = y0;; y += sign) {
			int x = calc_line_coordinate(y, line);
			if (x >= 0 && x < width && y >= 0 && y < height) {
				(*fb)[y * width + x] = color;
			}
			if (y == y1)
				break;
		}
	} else {
		// iterate over x-axis
		const struct line_eq line = {
			.c0 = fdy / fdx,
			.c1 = (fdx * y0 - fdy * x0) / fdx,
		};
		const int sign = copysignf(1.0f, dx);
		for (int x = x0;; x += sign) {
			int y = calc_line_coordinate(x, line);
			if (y >= 0 && y < height && x >= 0 && x < width) {
				(*fb)[y * width + x] = color;
			}
			if (x == x1)
				break;
		}
	}
}

struct rectangle {
	float a;
	float b;
	float x0;
	float y0;
	// for neighboor detection of end-points of a line
	float radius_squared;
	float line_width;
	float line_len;
	float width;
	float height;
};

static inline bool is_inside(const float x, const float y,
			     const struct rectangle &rec)
{
	const float tx = x - rec.x0;
	const float ty = y - rec.y0;

	// Relative coordinate with respect to the line starting from (x0, y0)
	const float rx = rec.a * tx + rec.b * ty;
	// Relative coordinate with respect to the line normal starting from
        // (x0, y0)
	const float ry = -rec.b * tx + rec.a * ty;

	// Use "half-circles" at the line end-points
        if (rx < 0) {
		if ((rx * rx + ry * ry) >= rec.radius_squared)
			return false;
        } else if (rx > rec.line_len) {
		if (((rx - rec.line_len) * (rx - rec.line_len) + ry * ry) >=
		    rec.radius_squared) {
			return false;
		}
        }

	if (ry < (-rec.line_width / 2) || ry >= (rec.line_width / 2))
		return false;

	// Screen space clip
	return x >= 0 && x < rec.width && y >= 0 && y < rec.height;
}

void draw_line_aa(vector<uint32_t> *fb,
                  const float x0, const float y0,
                  const float x1, const float y1,
                  const uint32_t color,
                  const float line_width,
                  const int width, const int height)
{
	CHECK(x0 < x1);
	CHECK(line_width > 0);

	const float fdx = x1 - x0;
	const float fdy = y1 - y0;
        const float line_len = sqrt(fdx * fdx + fdy * fdy);

        if (line_len < 1) {
		fprintf(stderr, "not implemented: len = %f\n", line_len);
		return;
        }

        const struct rectangle rectangle = {
		.a = fdx / line_len,
		.b = fdy / line_len,
		.x0 = x0,
		.y0 = y0,
		// The shape is a rectangle that is extended with a half-circle
		// whose radius is line_width / 2
		.radius_squared = (line_width * line_width / 4),
		.line_width = line_width,
		.line_len = line_len,
		.width = (float) width,
		.height = (float) height,
        };

	const int sx0 = std::floor(x0);
	const int sy0 = std::floor(y0);
	const int sx1 = std::floor(x1);
	const int sy1 = std::floor(y1);
	const int sdx = sx1 - sx0;
	const int sdy = sy1 - sy0;

	const int half_thickness = std::ceil(line_width  / 2);
	const int thickness = std::ceil(line_width);

	if (std::abs(fdx) <= std::abs(fdy)) {
		// Line eq coeffs:
		//
		//     la * x + lb * y + lc == 0
		//     (-fdy) * x + (fdx) * y + (fdy * x0 - fdx * y0) == 0
		// la = -fdy
		// lb = fdx
		// lc = fdy * x0 - fdx * y0
		//
		// These cofficients are used to calculate X coordinate when Y
		// is known.
		const struct line_eq line = {
			.c0 = fdx / fdy,
			.c1 = (fdy * x0 - fdx * y0) / fdy,
		};

		const float sign = copysignf(1.0f, fdy);
		// Check these
		float y = sy0 - half_thickness * sign + 0.5;
		int num_steps = std::abs(sdy) + thickness + 1;
		for (int i = 0; i < num_steps; i++) {
			// We pick x and y at the middle point of the screen
			// pixel, and check if (x, y) is inside the line
			float base_x = std::floor(
				calc_line_coordinate(y, line) -
				half_thickness) + 0.5;
			for (int j = 0; j < (thickness + 1); j++) {
				float x = base_x + j;
				if (is_inside(x, y, rectangle)) {
					int sx = x;
					int sy = y;
					(*fb)[sy * width + sx] = color;
				}
			}
			y += sign;
		}
	} else {
		// For calculating y value based on x value
		const struct line_eq line = {
			.c0 = fdy / fdx,
			.c1 = (fdx * y0 - fdy * x0) / fdx,
		};

		const float sign = copysignf(1.0f, fdx);
		// Check these
		float x = sx0 - half_thickness * sign + 0.5;
		int num_steps = std::abs(sdx) + thickness + 1;
		for (int i = 0; i < num_steps; i++) {
			// We pick x and y at the middle point of the screen
			// pixel, and check if (x, y) is inside the line
			float base_y = std::floor(
				calc_line_coordinate(x, line) -
				half_thickness) + 0.5;
			for (int j = 0; j < (thickness + 1); j++) {
				float y = base_y + j;
				if (is_inside(x, y, rectangle)) {
					int sx = x;
					int sy = y;
					(*fb)[sy * width + sx] = color;
				}
			}
			x += sign;
		}
	}
}

void shrink_aa_framebuffer(
	vector<uint32_t> *fb,
	const vector<uint32_t> *aa_fb,
	const int width,
	const int height,
	const int aa_factor)
{
	const unsigned int bit_shift = 2 * log2f(aa_factor);

	const int aa_width = width * aa_factor;
	for (int y = 0; y < height; y++) {
		for (int x = 0; x < width; x++) {
			int aax = x * aa_factor;
			int aay = y * aa_factor;
			unsigned int c0 = 0;
			unsigned int c1 = 0;
			unsigned int c2 = 0;
			unsigned int c3 = 0;
			for (int i = 0; i < aa_factor; i++) {
				for (int j = 0; j < aa_factor; j++) {
					int offset = (aay + i) * aa_width + aax + j;
					uint32_t value = (*aa_fb)[offset];
					c0 += (value >> 24);
					c1 += (value >> 16) & 0xff;
					c2 += (value >> 8) & 0xff;
					c3 += value & 0xff;
				}
			}
			c0 >>= bit_shift;
			c1 >>= bit_shift;
			c2 >>= bit_shift;
			c3 >>= bit_shift;
			(*fb)[y * width + x] = (c0 << 24) + (c1 << 16) + (c2 << 8) + c3;
		}
        }
}

}  // namespace uadegl
}  // namespace write_audio
}  // namespace uade
