import { REST, Routes } from 'discord.js'
import config from './config.json' with { type: "json" }

const { clientId, guildId, token } = config

const rest = new REST().setToken(token);
const commandId = "1352717863546519584"

// for guild-based commands
rest.delete(Routes.applicationGuildCommand(clientId, guildId, commandId))
	.then(() => console.log('Successfully deleted guild command'))
	.catch(console.error);

// for global commands
rest.delete(Routes.applicationCommand(clientId, commandId))
	.then(() => console.log('Successfully deleted application command'))
	.catch(console.error);
