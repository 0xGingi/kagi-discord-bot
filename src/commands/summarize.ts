import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, TextChannel, ChannelType } from 'discord.js';
import { querySummarizer, queryFastGPT } from '../utils/kagiApi';
import { createThreadForResults, shouldCreateThread, sendMessageToThread } from '../utils/threadManager';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ALLOW_MURIEL_ENGINE = process.env.ALLOW_MURIEL_ENGINE === 'true';

function calculateTokenPrice(inputTokens: number, outputTokens: number, engine: string | undefined): { price: number; formattedPrice: string } {
  if (engine === 'muriel') {
    return { price: 1.0, formattedPrice: '$1.00 USD (fixed price)' };
  } else {
    const totalTokens = inputTokens + outputTokens;
    const price = (totalTokens / 1000) * 0.03;
    return { 
      price,
      formattedPrice: `$${price.toFixed(4)} USD` 
    };
  }
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function createEngineOptions() {
  const engineChoices = [
    { name: 'Cecil (Default) - Friendly, descriptive, fast', value: 'cecil' },
    { name: 'Agnes - Formal, technical, analytical', value: 'agnes' }
  ];
  
  if (ALLOW_MURIEL_ENGINE) {
    engineChoices.push({ name: 'Muriel - Best-in-class, enterprise-grade', value: 'muriel' });
  }
  
  return engineChoices;
}

export const data = new SlashCommandBuilder()
  .setName('summarize')
  .setDescription('Summarize content using the Kagi Universal Summarizer API')
  .addSubcommand(subcommand =>
    subcommand
      .setName('url')
      .setDescription('Summarize content from a URL')
      .addStringOption(option =>
        option.setName('url')
          .setDescription('The URL to summarize')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('engine')
          .setDescription('Summarization engine to use')
          .setRequired(false)
          .addChoices(...createEngineOptions())
      )
      .addStringOption(option =>
        option.setName('summary_type')
          .setDescription('Type of summary to generate')
          .setRequired(false)
          .addChoices(
            { name: 'Summary - Paragraph(s) of prose', value: 'summary' },
            { name: 'Takeaway - Bulleted list of key points (Default)', value: 'takeaway' }
          )
      )
      .addStringOption(option =>
        option.setName('target_language')
          .setDescription('Target language for the summary')
          .setRequired(false)
          .addChoices(
            { name: 'English', value: 'EN' },
            { name: 'Spanish', value: 'ES' },
            { name: 'French', value: 'FR' },
            { name: 'German', value: 'DE' },
            { name: 'Japanese', value: 'JA' },
            { name: 'Chinese (Simplified)', value: 'ZH' },
            { name: 'Russian', value: 'RU' }
          )
      )
      .addBooleanOption(option =>
        option.setName('cache')
          .setDescription('Whether to allow cached responses (default: true)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('text')
      .setDescription('Summarize provided text')
      .addStringOption(option =>
        option.setName('text')
          .setDescription('The text to summarize')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('engine')
          .setDescription('Summarization engine to use')
          .setRequired(false)
          .addChoices(...createEngineOptions())
      )
      .addStringOption(option =>
        option.setName('summary_type')
          .setDescription('Type of summary to generate')
          .setRequired(false)
          .addChoices(
            { name: 'Summary - Paragraph(s) of prose', value: 'summary' },
            { name: 'Takeaway - Bulleted list of key points (Default)', value: 'takeaway' }
          )
      )
      .addStringOption(option =>
        option.setName('target_language')
          .setDescription('Target language for the summary')
          .setRequired(false)
          .addChoices(
            { name: 'English', value: 'EN' },
            { name: 'Spanish', value: 'ES' },
            { name: 'French', value: 'FR' },
            { name: 'German', value: 'DE' },
            { name: 'Japanese', value: 'JA' },
            { name: 'Chinese (Simplified)', value: 'ZH' },
            { name: 'Russian', value: 'RU' }
          )
      )
      .addBooleanOption(option =>
        option.setName('cache')
          .setDescription('Whether to allow cached responses (default: true)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('channel')
      .setDescription('Summarize recent messages in this channel')
      .addIntegerOption(option =>
        option.setName('messages')
          .setDescription('Number of messages to include (default: 20, max: 100)')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(100)
      )
      .addStringOption(option =>
        option.setName('engine')
          .setDescription('Summarization engine to use')
          .setRequired(false)
          .addChoices(...createEngineOptions())
      )
      .addStringOption(option =>
        option.setName('summary_type')
          .setDescription('Type of summary to generate')
          .setRequired(false)
          .addChoices(
            { name: 'Summary - Paragraph(s) of prose', value: 'summary' },
            { name: 'Takeaway - Bulleted list of key points (Default)', value: 'takeaway' }
          )
      )
      .addStringOption(option =>
        option.setName('target_language')
          .setDescription('Target language for the summary')
          .setRequired(false)
          .addChoices(
            { name: 'English', value: 'EN' },
            { name: 'Spanish', value: 'ES' },
            { name: 'French', value: 'FR' },
            { name: 'German', value: 'DE' },
            { name: 'Japanese', value: 'JA' },
            { name: 'Chinese (Simplified)', value: 'ZH' },
            { name: 'Russian', value: 'RU' }
          )
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  try {
    const subcommand = interaction.options.getSubcommand();
    const engine = interaction.options.getString('engine') || undefined;
    const summaryType = interaction.options.getString('summary_type') || 'takeaway';
    const targetLanguage = interaction.options.getString('target_language') || undefined;
    const cache = interaction.options.getBoolean('cache') ?? undefined;
    
    if (engine === 'muriel' && !ALLOW_MURIEL_ENGINE) {
      await interaction.editReply('The Muriel engine is disabled by the bot administrator due to cost concerns. Please use Cecil or Agnes instead.');
      return;
    }

    let params: any = {
      engine,
      summary_type: summaryType,
      target_language: targetLanguage,
      cache
    };

    if (subcommand === 'url') {
      const url = interaction.options.getString('url');
      if (!url) {
        await interaction.editReply('URL is required');
        return;
      }
      params.url = url;
      
      if (engine === 'muriel') {
        await interaction.followUp({
          content: 'Note: The Muriel engine costs $1 USD per summary, regardless of length.',
          ephemeral: true
        });
      }

      const response = await querySummarizer(params);
      const { output, tokens: inputTokens } = response.data;
      
      const outputTokens = estimateTokenCount(output);
      
      const { formattedPrice } = calculateTokenPrice(inputTokens, outputTokens, engine);

      const embed = new EmbedBuilder()
        .setColor(0x8855FF)
        .setTitle(`URL Summary`)
        .setDescription(output)
        .addFields(
          { name: 'Engine', value: engine || 'cecil (default)', inline: true },
          { name: 'Summary Type', value: summaryType || 'takeaway (default)', inline: true },
          { name: 'Input Tokens', value: inputTokens.toString(), inline: true },
          { name: 'Output Tokens', value: outputTokens.toString(), inline: true },
          { name: 'Total Tokens', value: (inputTokens + outputTokens).toString(), inline: true },
          { name: 'Estimated Cost', value: formattedPrice, inline: true }
        )
        .setTimestamp()
        .setURL(params.url);

      if (targetLanguage) {
        embed.addFields({ name: 'Target Language', value: targetLanguage, inline: true });
      }
      
      embed.setFooter({ text: `API Balance: $${response.meta.api_balance?.toFixed(3) || 'N/A'}` });

      const thread = shouldCreateThread(JSON.stringify(embed).length) 
        ? await createThreadForResults(interaction, `URL: ${url}`, 'summarize')
        : null;

      if (thread) {
        await interaction.editReply({ 
          content: `URL summary available in the thread below.` 
        });
        
        await sendMessageToThread(thread, { embeds: [embed] });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
    } else if (subcommand === 'text') {
      const text = interaction.options.getString('text');
      if (!text) {
        await interaction.editReply('Text is required');
        return;
      }
      params.text = text;
      
      if (engine === 'muriel') {
        await interaction.followUp({
          content: 'Note: The Muriel engine costs $1 USD per summary, regardless of length.',
          ephemeral: true
        });
      }

      const response = await querySummarizer(params);
      const { output, tokens: inputTokens } = response.data;
      
      const outputTokens = estimateTokenCount(output);
      
      const { formattedPrice } = calculateTokenPrice(inputTokens, outputTokens, engine);

      const embed = new EmbedBuilder()
        .setColor(0x8855FF)
        .setTitle(`Text Summary`)
        .setDescription(output)
        .addFields(
          { name: 'Engine', value: engine || 'cecil (default)', inline: true },
          { name: 'Summary Type', value: summaryType || 'takeaway (default)', inline: true },
          { name: 'Input Tokens', value: inputTokens.toString(), inline: true },
          { name: 'Output Tokens', value: outputTokens.toString(), inline: true },
          { name: 'Total Tokens', value: (inputTokens + outputTokens).toString(), inline: true },
          { name: 'Estimated Cost', value: formattedPrice, inline: true }
        )
        .setTimestamp();

      if (targetLanguage) {
        embed.addFields({ name: 'Target Language', value: targetLanguage, inline: true });
      }
      
      embed.setFooter({ text: `API Balance: $${response.meta.api_balance?.toFixed(3) || 'N/A'}` });

      const thread = shouldCreateThread(JSON.stringify(embed).length) 
        ? await createThreadForResults(interaction, text.substring(0, 50) + (text.length > 50 ? '...' : ''), 'summarize')
        : null;

      if (thread) {
        await interaction.editReply({ 
          content: `Text summary available in the thread below.` 
        });
        
        await sendMessageToThread(thread, { embeds: [embed] });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
    } else if (subcommand === 'channel') {
      if (process.env.MESSAGE_CONTENT_ENABLED !== 'true') {
        await interaction.editReply('The channel summarizer is disabled because the Message Content Intent is not enabled. Please contact the bot owner to enable it.');
        return;
      }

      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
        await interaction.editReply('This command can only be used in text channels');
        return;
      }

      const textChannel = interaction.channel as TextChannel;
      const messageLimit = interaction.options.getInteger('messages') || 20;
      
      const messages = await textChannel.messages.fetch({ limit: messageLimit });
      
      if (messages.size === 0) {
        await interaction.editReply('No messages found to summarize');
        return;
      }
      
      const messageArray = Array.from(messages.values()).reverse();
      
      const formattedMessages = messageArray.map(msg => {
        const author = msg.author.bot ? `${msg.author.username} (Bot)` : msg.author.username;
        return `${author}: ${msg.content}`;
      }).filter(msg => msg.split(': ')[1].trim() !== '');
      
      if (formattedMessages.length === 0) {
        await interaction.editReply('No messages with text content found to summarize');
        return;
      }
      
      const messageText = formattedMessages.join('\n');
      
      if (engine === 'muriel') {
        await interaction.followUp({
          content: 'Note: The Muriel engine costs $1 USD per summary, regardless of length.',
          ephemeral: true
        });
      }
      
      if (messageText.length <= 10000) {
        params.text = messageText;
        const response = await querySummarizer(params);
        const { output, tokens: inputTokens } = response.data;
        
        const outputTokens = estimateTokenCount(output);
        
        const { formattedPrice } = calculateTokenPrice(inputTokens, outputTokens, engine);
        
        const embed = new EmbedBuilder()
          .setColor(0x8855FF)
          .setTitle(`Channel Summary`)
          .setDescription(output)
          .addFields(
            { name: 'Engine', value: engine || 'cecil (default)', inline: true },
            { name: 'Summary Type', value: summaryType || 'takeaway (default)', inline: true },
            { name: 'Messages Analyzed', value: formattedMessages.length.toString(), inline: true },
            { name: 'Input Tokens', value: inputTokens.toString(), inline: true },
            { name: 'Output Tokens', value: outputTokens.toString(), inline: true },
            { name: 'Total Tokens', value: (inputTokens + outputTokens).toString(), inline: true },
            { name: 'Estimated Cost', value: formattedPrice, inline: true }
          )
          .setTimestamp();
        
        if (targetLanguage) {
          embed.addFields({ name: 'Target Language', value: targetLanguage, inline: true });
        }
        
        embed.setFooter({ text: `API Balance: $${response.meta.api_balance?.toFixed(3) || 'N/A'}` });
        
        const thread = shouldCreateThread(JSON.stringify(embed).length) 
          ? await createThreadForResults(interaction, `Channel summary (${formattedMessages.length} messages)`, 'summarize')
          : null;

        if (thread) {
          await interaction.editReply({ 
            content: `Channel summary available in the thread below.` 
          });
          
          await sendMessageToThread(thread, { embeds: [embed] });
        } else {
          await interaction.editReply({ embeds: [embed] });
        }
      } else {
        const query = `Summarize the following chat conversation:\n\n${messageText}`;
        const response = await queryFastGPT({
          query,
          web_search: false,
          cache: false
        });
        
        const { output, tokens: inputTokens } = response.data;
        
        const outputTokens = estimateTokenCount(output);
        
        const embed = new EmbedBuilder()
          .setColor(0x8855FF)
          .setTitle(`Channel Summary (FastGPT)`)
          .setDescription(output)
          .addFields(
            { name: 'Messages Analyzed', value: formattedMessages.length.toString(), inline: true },
            { name: 'Input Tokens', value: inputTokens.toString(), inline: true },
            { name: 'Output Tokens', value: outputTokens.toString(), inline: true },
            { name: 'Total Tokens', value: (inputTokens + outputTokens).toString(), inline: true },
            { name: 'Estimated Cost', value: `$${((inputTokens + outputTokens) / 1000 * 0.015).toFixed(4)} USD`, inline: true }
          )
          .setTimestamp();
        
        embed.setFooter({ text: `API Balance: $${response.meta.api_balance?.toFixed(3) || 'N/A'}` });
        
        const thread = shouldCreateThread(JSON.stringify(embed).length) 
          ? await createThreadForResults(interaction, `Channel summary (${formattedMessages.length} messages)`, 'summarize')
          : null;

        if (thread) {
          await interaction.editReply({ 
            content: `Channel summary available in the thread below.` 
          });
          
          await sendMessageToThread(thread, { embeds: [embed] });
        } else {
          await interaction.editReply({ embeds: [embed] });
        }
      }
    }
  } catch (error: unknown) {
    console.error('Error in summarize command:', error);
    
    let errorMessage = 'An error occurred while querying the Kagi API.';
    
    if (axios.isAxiosError(error) && error.response?.data?.detail) {
      errorMessage += ` Error: ${error.response.data.detail}`;
    } else if (error instanceof Error) {
      errorMessage += ` Error: ${error.message}`;
    }
    
    await interaction.editReply(errorMessage);
  }
} 