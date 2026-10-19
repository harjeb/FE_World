// 固定人物的肤色与发色（取自 design/pixel-art/gen_art.py 的 PORTRAITS，battle.test.ts 校对两边一致），
// 交战形象按它换色，战斗里认得出是谁。随机招募和杂兵用随机头像的配色。
export const CHARACTER_COLORS: Record<string, { skin: [string, string]; hair: [string, string] }> = {
  erin: { skin: ['#F0C49C', '#CF956E'], hair: ['#9A4430', '#5E241A'] },
  karl: { skin: ['#D9A57A', '#B07A56'], hair: ['#C99A4A', '#8E6A2E'] },
  victor: { skin: ['#EEC4A0', '#C9906C'], hair: ['#B4B2AA', '#77756E'] },
  lina: { skin: ['#F6D2B0', '#D9A684'], hair: ['#E6D49A', '#B09C62'] },
  owen: { skin: ['#F0C8A2', '#CC9270'], hair: ['#6B4A2E', '#4A321E'] },
  sera: { skin: ['#F4D6C0', '#D4A88E'], hair: ['#4E3A5E', '#2E2238'] },
  noah: { skin: ['#F2CCA8', '#CF9A78'], hair: ['#D8D6D0', '#A09E96'] },
  gustav: { skin: ['#D9A27A', '#AE7656'], hair: ['#4A3626', '#2A1E14'] },
  ren: { skin: ['#EEDACA', '#C9AE9A'], hair: ['#CDD1D8', '#8E949E'] },
  ig: { skin: ['#F0C4A0', '#CC8E6C'], hair: ['#B5452B', '#7A2A1A'] },
  mira: { skin: ['#F6D4B8', '#D8A88A'], hair: ['#C77A86', '#8E4A56'] },
  roland: { skin: ['#F2C8A0', '#CF9470'], hair: ['#D6B060', '#9A7A38'] },
  brock: { skin: ['#B57E58', '#8C5A3C'], hair: ['#3A2A1E', '#20160E'] },
};
