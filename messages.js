const moment = require("moment");
const i18n = require("i18n");
const { generateEventImage, generateInventoryImage } = require("./images");
const { digitsFormatter, humanFormatter } = require("./utils");

const LOCALE_DIR = __dirname + "/locales";
const KILL_URL = "https://albiononline.com/{lang}/killboard/kill/{kill}";
const GREEN = 52224;
const RED = 13369344;
const BATTLE = 16752981;
const RANKING_LINE_LENGTH = 23;

const MAXLEN = {
  TITLE: 256,
  DESCRIPTION: 2048,
  FIELD: {
    NAME: 256,
    VALUE: 1024,
    COUNT: 25,
  },
  FOOTER: 2048,
  AUTHOR: 256,
};

exports.getI18n = (locale = "en") => {
  const l = {};
  i18n.configure({
    directory: LOCALE_DIR,
    objectNotation: true,
    defaultLocale: "en",
    register: l,
  });
  l.setLocale(locale);
  return l;
};

exports.embedEvent = (event, locale) => {
  const l = exports.getI18n(locale);

  const good = event.good;
  const title = l.__("KILL.EVENT", {
    killer: event.Killer.Name,
    victim: event.Victim.Name,
  });

  let description;
  if (event.numberOfParticipants === 1) {
    description = l.__(`KILL.SOLO_${Math.floor(Math.random() * 6)}`);
  } else {
    const totalDamage = event.Participants.reduce((sum, participant) => {
      return sum + participant.DamageDone;
    }, 0);
    const assist = [];
    event.Participants.forEach((participant) => {
      // Self-damage isn't assist :P
      if (participant.Name === event.Victim.Name) {
        return;
      }
      const damagePercent = Math.round((participant.DamageDone / Math.max(1, totalDamage)) * 100);
      assist.push(`${participant.Name} (${damagePercent}%)`);
    });

    if (assist.length > 0) {
      description = l.__("KILL.ASSIST", { assists: assist.join(" / ") });
    }
  }

  let killerGuildValue;
  if (event.Killer.GuildName) {
    killerGuildValue = event.Killer.AllianceName ? `[${event.Killer.AllianceName}] ` : "";
    killerGuildValue += event.Killer.GuildName;
  }

  let victimGuildValue;
  if (event.Victim.GuildName) {
    victimGuildValue = event.Victim.AllianceName ? `[${event.Victim.AllianceName}] ` : "";
    victimGuildValue += event.Victim.GuildName;
  }

  return {
    embed: {
      color: good ? GREEN : RED,
      title,
      url: KILL_URL.replace("{lang}", l.getLocale()).replace("{kill}", event.EventId),
      description,
      thumbnail: {
        url: "https://lespibis.github.io/albion_killbot_assets.github.io/imgs/icon.png",
      },
      fields: [
        {
          name: l.__("KILL.FAME"),
          value: digitsFormatter(event.TotalVictimKillFame),
          inline: false,
        },
        {
          name: l.__("KILL.KILLER_GUILD"),
          value: killerGuildValue || l.__("KILL.NO_GUILD"),
          inline: true,
        },
        {
          name: l.__("KILL.VICTIM_GUILD"),
          value: victimGuildValue || l.__("KILL.NO_GUILD"),
          inline: true,
        },
        {
          name: "\u200B",
          value: "\u200B",
          inline: true,
        },
        {
          name: l.__("KILL.KILLER_IP"),
          value: Math.round(event.Killer.AverageItemPower),
          inline: true,
        },
        {
          name: l.__("KILL.VICTIM_IP"),
          value: Math.round(event.Victim.AverageItemPower),
          inline: true,
        },
        {
          name: "\u200B",
          value: "\u200B",
          inline: true,
        },
      ],
      timestamp: event.TimeStamp,
    },
  };
};

exports.embedEventAsImage = async (event, locale) => {
  const l = exports.getI18n(locale);

  const good = event.good;
  const title = l.__("KILL.EVENT", {
    killer: event.Killer.Name,
    victim: event.Victim.Name,
  });
  const filename = `${event.EventId}-event.png`;

  return {
    embed: {
      color: good ? GREEN : RED,
      title,
      url: KILL_URL.replace("{lang}", l.getLocale()).replace("{kill}", event.EventId),
      files: [
        {
          attachment: await generateEventImage(event),
          name: filename,
        },
      ],
      image: {
        url: `attachment://${filename}`,
      },
    },
  };
};

exports.embedInventoryAsImage = async (event, locale) => {
  const l = exports.getI18n(locale);
  const good = event.good;
  const filename = `${event.EventId}-inventory.png`;

  return {
    embed: {
      color: good ? GREEN : RED,
      url: KILL_URL.replace("{lang}", l.getLocale()).replace("{kill}", event.EventId),
      files: [
        {
          attachment: await generateInventoryImage(event),
          name: filename,
        },
      ],
      image: {
        url: `attachment://${filename}`,
      },
    },
  };
};

exports.embedBattle = (battle, locale) => {
  const l = exports.getI18n(locale);

  const guildCount = Object.keys(battle.guilds || {}).length;

  const duration = moment
    .duration(moment(battle.endTime) - moment(battle.startTime))
    .locale(locale || "en")
    .humanize();
  const description = l.__("BATTLE.DESCRIPTION", {
    players: Object.keys(battle.players || {}).length,
    kills: battle.totalKills,
    fame: digitsFormatter(battle.totalFame),
    duration,
  });

  const line = (item) => {
    return l.__("BATTLE.LINE", {
      name: item.name,
      total: item.total,
      kills: item.kills,
      deaths: item.deaths,
      fame: digitsFormatter(item.killFame),
    });
  };

  const fields = [];
  const players = Object.keys(battle.players).map((id) => battle.players[id]);
  Object.keys(battle.alliances).forEach((id) => {
    const alliance = battle.alliances[id];
    alliance.total = players.reduce((sum, player) => sum + Number(player.allianceId === alliance.id), 0);
    const name = line(alliance);

    let value = "";
    Object.values(battle.guilds)
      .filter((guild) => guild.allianceId === id)
      .forEach((guild) => {
        guild.total = players.reduce((sum, player) => sum + Number(player.guildId === guild.id), 0);
        value += line(guild);
        value += "\n";
      });

    fields.push({
      name,
      value: value.substr(0, MAXLEN.FIELD.VALUE),
    });
  });

  const guildsWithoutAlliance = Object.values(battle.guilds).filter((guild) => !guild.allianceId);
  const playersWithoutGuild = Object.values(battle.players).filter((player) => !player.guildId);
  if (guildsWithoutAlliance.length > 0 || playersWithoutGuild.length > 0) {
    const name = l.__("BATTLE.NO_ALLIANCE");

    let value = "";
    guildsWithoutAlliance.forEach((guild) => {
      guild.total = players.reduce((sum, player) => sum + Number(player.guildId === guild.id), 0);
      value += line(guild);
      value += "\n";
    });

    if (playersWithoutGuild.length > 0) {
      const stats = {
        name: l.__("BATTLE.NO_GUILD"),
        total: 0,
        kills: 0,
        deaths: 0,
        killFame: 0,
      };
      playersWithoutGuild.forEach((player) => {
        stats.total += 1;
        stats.kills += player.kills;
        stats.deaths += player.deaths;
        stats.killFame += player.killFame;
      });
      value += line(stats);
      value += "\n";
    }

    fields.push({
      name,
      value: value.substr(0, MAXLEN.FIELD.VALUE),
    });
  }

  return {
    embed: {
      color: BATTLE,
      title: l.__("BATTLE.EVENT", { guilds: guildCount }),
      url: `https://kill-board.com/battles/bagang/${battle.id}`,
      description,
      thumbnail: {
        url: "https://user-images.githubusercontent.com/13356774/76130049-b9eec480-5fdf-11ea-95c0-7de130a705a3.png",
      },
      fields: fields.slice(0, MAXLEN.FIELD.COUNT),
      timestamp: moment(battle.endTime).toISOString(),
    },
  };
};

exports.embedRankings = (guild, locale) => {
  const l = exports.getI18n(locale);

  const generateRankFieldValue = (ranking, pvp = false) => {
    let value = "```c";
    if (ranking.length === 0) {
      const nodata = l.__("RANKING.NO_DATA_SHORT");
      value += `\n${nodata}${" ".repeat(RANKING_LINE_LENGTH - nodata.length)}`;
    }
    ranking.forEach((item) => {
      if (pvp) {
        const fameValue = humanFormatter(item.KillFame, 2);
        value += `\n${item.Name}${" ".repeat(RANKING_LINE_LENGTH - fameValue.length - item.Name.length)}${fameValue}`;
      } else {
        const fameValue = humanFormatter(item.Fame, 2);
        value += `\n${item.Player.Name}${" ".repeat(
          RANKING_LINE_LENGTH - fameValue.length - item.Player.Name.length,
        )}${fameValue}`;
      }
    });
    value += "```";
    return value;
  };

  return {
    embed: {
      title: l.__("RANKING.MONTHLY", { guild: guild.Name }),
      url: `https://albiononline.com/pt/killboard/guild/${guild._id}`,
      thumbnail: {
        url: "https://user-images.githubusercontent.com/13356774/76129834-f53cc380-5fde-11ea-8c88-daa9872c2d72.png",
      },
      fields: [
        {
          name: l.__("RANKING.PVE"),
          value: generateRankFieldValue(guild.rankings.pve),
          inline: true,
        },
        {
          name: l.__("RANKING.PVP"),
          value: generateRankFieldValue(guild.rankings.pvp, true),
          inline: true,
        },
        {
          name: "\u200B",
          value: "\u200B",
          inline: false,
        },
        {
          name: l.__("RANKING.GATHERING"),
          value: generateRankFieldValue(guild.rankings.gathering),
          inline: true,
        },
        {
          name: l.__("RANKING.CRAFTING"),
          value: generateRankFieldValue(guild.rankings.crafting),
          inline: true,
        },
      ],
      timestamp: moment().toISOString(),
    },
  };
};

exports.embedList = (config) => {
  const l = exports.getI18n(config.lang);

  const configToList = (list) => {
    if (!list || list.length === 0) return l.__("TRACK.NONE");
    return list.map((item) => item.name).join("\n");
  };

  return {
    embed: {
      description: l.__("TRACK.LIST"),
      fields: [
        {
          name: l.__("TRACK.PLAYERS"),
          value: configToList(config.trackedPlayers),
          inline: true,
        },
        {
          name: l.__("TRACK.GUILDS"),
          value: configToList(config.trackedGuilds),
          inline: true,
        },
        {
          name: l.__("TRACK.ALLIANCES"),
          value: configToList(config.trackedAlliances),
          inline: true,
        },
      ],
    },
  };
};

exports.embedDailyRanking = (rankings, locale) => {
  const l = exports.getI18n(locale);

  const generateRankFieldValue = (ranking, name = "name", number = "fame") => {
    let value = "```c";
    if (ranking.length === 0) {
      const nodata = l.__("RANKING.NO_DATA_SHORT");
      value += `\n${nodata}${" ".repeat(RANKING_LINE_LENGTH - nodata.length)}`;
    }
    ranking.forEach((item) => {
      const nameValue = item[name];
      const numberValue = humanFormatter(item[number], 2);
      value += `\n${nameValue}${" ".repeat(RANKING_LINE_LENGTH - numberValue.length - nameValue.length)}${numberValue}`;
    });
    value += "```";
    return value;
  };

  return {
    embed: {
      title: l.__("RANKING.DAILY"),
      thumbnail: {
        url: "https://user-images.githubusercontent.com/13356774/76129834-f53cc380-5fde-11ea-8c88-daa9872c2d72.png",
      },
      fields: [
        {
          name: l.__("RANKING.TOTAL_KILL_FAME"),
          value: digitsFormatter(rankings.totalKillFame),
          inline: true,
        },
        {
          name: l.__("RANKING.TOTAL_DEATH_FAME"),
          value: digitsFormatter(rankings.totalDeathFame),
          inline: true,
        },
        {
          name: "\u200B",
          value: "\u200B",
          inline: false,
        },
        {
          name: l.__("RANKING.KILL_FAME"),
          value: generateRankFieldValue(rankings.killRanking, "name", "killFame"),
          inline: true,
        },
        {
          name: l.__("RANKING.DEATH_FAME"),
          value: generateRankFieldValue(rankings.deathRanking, "name", "deathFame"),
          inline: true,
        },
      ],
    },
  };
};
