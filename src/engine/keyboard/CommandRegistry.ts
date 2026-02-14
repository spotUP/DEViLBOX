import { Command, CommandContext } from './types';

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
