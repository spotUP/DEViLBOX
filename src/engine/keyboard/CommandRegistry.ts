import type { Command, CommandContext } from './types';

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  execute(commandName: string, context: CommandContext): boolean {
    const command = this.commands.get(commandName);
    if (!command) return false;

    // Check if command is valid in current context
    if (!command.contexts.includes(context)) return false;

    return command.handler();
  }

  /**
   * Execute the release handler for a held command (keyup).
   * Returns true if a release handler existed and was called.
   */
  release(commandName: string, context: CommandContext): boolean {
    const command = this.commands.get(commandName);
    if (!command?.releaseHandler) return false;
    if (!command.contexts.includes(context)) return false;
    return command.releaseHandler();
  }

  /**
   * Check if a command has a release handler (is a held command).
   */
  hasReleaseHandler(commandName: string): boolean {
    return !!this.commands.get(commandName)?.releaseHandler;
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  getCommandsForContext(context: CommandContext): Command[] {
    return this.getAllCommands().filter(cmd => cmd.contexts.includes(context));
  }
}
