// for finding memory leaks in debug mode with Visual Studio 
#if defined _DEBUG && defined _MSC_VER
#include <crtdbg.h>
#endif

#include <stdarg.h>
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <ctype.h> // toupper()
#include "pt2_structs.h"
#include "pt2_config.h"

void showErrorMsgBox(const char *fmt, ...)
{
	(void)fmt; // no-op in WASM headless build
}

void sanitizeFilenameChar(char *chr)
{
	// some of these are legal on GNU/Linux and macOS, but whatever...
	     if (*chr == '\\') *chr = ' ';
	else if (*chr ==  '/') *chr = ' ';
	else if (*chr ==  ':') *chr = ' ';
	else if (*chr ==  '*') *chr = ' ';
	else if (*chr ==  '?') *chr = ' ';
	else if (*chr == '\"') *chr = ' ';
	else if (*chr ==  '<') *chr = ' ';
	else if (*chr ==  '>') *chr = ' ';
	else if (*chr ==  '|') *chr = ' ';
}

bool sampleNameIsEmpty(char *name)
{
	if (name == NULL)
		return true;

	for (int32_t i = 0; i < 22; i++)
	{
		if (name[i] != '\0')
			return false;
	}

	return true;
}

bool moduleNameIsEmpty(char *name)
{
	if (name == NULL)
		return true;

	for (int32_t i = 0; i < 20; i++)
	{
		if (name[i] != '\0')
			return false;
	}

	return true;
}

void updateWindowTitle(bool modified)
{
	if (song != NULL)
	{
		if (modified)
			song->modified = true;
		else
			song->modified = false;
	}
}
