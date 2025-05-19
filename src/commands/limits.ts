import { SlashCommandBuilder } from 'discord.js';
import queryLimiter from '../utils/queryLimiter';

export const data = new SlashCommandBuilder()
  .setName('limits')
  .setDescription('Check your remaining query limits');

export async function execute(interaction: any) {
  const userId = interaction.user.id;
  const commandNames = ['fastgpt', 'websearch', 'newssearch', 'summarize', 'search'];
  
  const globalLimitInfo = queryLimiter.getGlobalLimitInfo();
  let description = '';
  
  if (globalLimitInfo) {
    const remaining = queryLimiter.getRemainingQueries(userId, 'fastgpt').global;
    description += `**Global Limit:** ${remaining}/${globalLimitInfo.limit} remaining (${globalLimitInfo.period})\n\n`;
  } else {
    description += `**Global Limit:** Unlimited\n\n`;
  }
  
  description += '**Command Limits:**\n';
  
  for (const cmdName of commandNames) {
    const cmdLimitInfo = queryLimiter.getCommandLimitInfo(cmdName);
    if (cmdLimitInfo) {
      const remaining = queryLimiter.getRemainingQueries(userId, cmdName).command;
      description += `/${cmdName}: ${remaining}/${cmdLimitInfo.limit} remaining (${cmdLimitInfo.period})\n`;
    } else {
      description += `/${cmdName}: Unlimited\n`;
    }
  }
  
  await interaction.reply({
    embeds: [{
      title: 'Your Query Limits',
      description,
      color: 0x3498db,
      footer: {
        text: 'Limits reset based on the configured time period'
      }
    }],
    ephemeral: true
  });
} 