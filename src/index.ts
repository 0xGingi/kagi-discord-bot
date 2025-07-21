import { Client, Events, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import queryLimiter from './utils/queryLimiter';
import logger from './utils/logger';

dotenv.config();

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
];

if (process.env.MESSAGE_CONTENT_ENABLED === 'true') {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({
  intents
});

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, any>;
  }
}

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
let commandFiles: string[] = [];

try {
  commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));
  logger.info(`Found ${commandFiles.length} command files`, { commandFiles });
} catch (error) {
  logger.error('Failed to read commands directory', error, { commandsPath });
  process.exit(1);
}

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      logger.info(`Loaded command: ${command.data.name}`, { file, commandName: command.data.name });
    } else {
      logger.warn(`Command at ${filePath} is missing required "data" or "execute" property`, { file });
    }
  } catch (error) {
    logger.error(`Failed to load command from ${file}`, error, { file, filePath });
  }
}

const registerCommands = async () => {
  const commands = [];
  logger.info('Starting command registration process');

  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if ('data' in command && typeof command.data.toJSON === 'function') {
        commands.push(command.data.toJSON());
        logger.debug(`Added command to registration list: ${command.data.name}`, { file });
      }
    } catch (error) {
      logger.error(`Failed to process command for registration: ${file}`, error, { file });
    }
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

  try {
    logger.info(`Registering ${commands.length} application commands`);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID!),
      { body: commands },
    );

    logger.info('Successfully registered all application commands');
  } catch (error) {
    logger.error('Failed to register application commands', error, { 
      commandCount: commands.length,
      clientId: process.env.CLIENT_ID?.substring(0, 8) + '...'
    });
  }
};

client.once(Events.ClientReady, async readyClient => {
  logger.info(`Discord bot ready! Logged in as ${readyClient.user.tag}`, {
    userId: readyClient.user.id,
    username: readyClient.user.username,
    guildCount: readyClient.guilds.cache.size
  });
  
  try {
    await registerCommands();
  } catch (error) {
    logger.error('Failed to register commands during bot startup', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  
  const startTime = Date.now();
  const userId = interaction.user.id;
  const commandName = interaction.commandName;
  const guildId = interaction.guildId;
  
  logger.commandStart(commandName, userId, guildId || undefined, {
    channelId: interaction.channelId,
    options: interaction.options.data.map(option => ({
      name: option.name,
      type: option.type,
      value: typeof option.value === 'string' && option.value.length > 100 
        ? option.value.substring(0, 100) + '...' 
        : option.value
    }))
  });
  
  // Check DM restrictions
  if (!interaction.guild && process.env.ALLOW_DM_COMMANDS !== 'true') {
    logger.warn(`Command ${commandName} attempted in DMs by user ${userId}`);
    try {
      await interaction.reply({ content: 'Commands cannot be used in Direct Messages.', ephemeral: true });
    } catch (error) {
      logger.error(`Failed to send DM restriction message for command ${commandName}`, error, { userId });
    }
    return;
  }

  const command = client.commands.get(commandName);

  if (!command) {
    logger.error(`No command matching ${commandName} was found`, undefined, { 
      commandName, 
      userId,
      availableCommands: Array.from(client.commands.keys())
    });
    try {
      await interaction.reply({ content: 'This command is not available.', ephemeral: true });
    } catch (error) {
      logger.error(`Failed to send command not found message`, error, { commandName, userId });
    }
    return;
  }

  try {
    // Query limit check (skip for limits command)
    if (commandName !== 'limits') {
      if (!queryLimiter.canMakeQuery(userId, commandName)) {
        const cmdLimitInfo = queryLimiter.getCommandLimitInfo(commandName);
        const globalLimitInfo = queryLimiter.getGlobalLimitInfo();
        
        logger.warn(`Query limit hit for user ${userId} on command ${commandName}`, {
          userId,
          commandName,
          commandLimit: cmdLimitInfo,
          globalLimit: globalLimitInfo
        });
        
        let limitMessage = 'You have reached your query limit. ';
        
        if (cmdLimitInfo) {
          limitMessage += `The limit for /${commandName} is ${cmdLimitInfo.limit} queries per ${cmdLimitInfo.period}. `;
        }
        
        if (globalLimitInfo) {
          limitMessage += `The global limit is ${globalLimitInfo.limit} queries per ${globalLimitInfo.period}.`;
        }
        
        await interaction.reply({ content: limitMessage, ephemeral: true });
        return;
      }
      
      queryLimiter.recordQuery(userId, commandName);
    }
    
    // Execute command
    await command.execute(interaction);
    
    const duration = Date.now() - startTime;
    logger.commandSuccess(commandName, userId, duration);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.commandError(commandName, userId, error, {
      duration,
      guildId,
      channelId: interaction.channelId,
      replied: interaction.replied,
      deferred: interaction.deferred
    });
    
    // Send error response to user
    try {
      const errorMessage = 'There was an error executing this command! The error has been logged for investigation.';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (followUpError) {
      logger.error(`Failed to send error message to user for command ${commandName}`, followUpError, { 
        userId, 
        originalError: error 
      });
    }
  }
});

// Add error handlers for the Discord client
client.on(Events.Error, error => {
  logger.error('Discord client error', error);
});

client.on(Events.Warn, warning => {
  logger.warn('Discord client warning', { warning });
});

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at Promise', reason, { promise: promise.toString() });
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  client.destroy();
  process.exit(0);
});

// Login with error handling
logger.info('Starting Discord bot login process');
client.login(process.env.DISCORD_TOKEN).catch(error => {
  logger.error('Failed to login to Discord', error, {
    tokenProvided: !!process.env.DISCORD_TOKEN,
    tokenLength: process.env.DISCORD_TOKEN?.length
  });
  process.exit(1);
}); 