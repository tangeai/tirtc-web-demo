/**
 * 应用主题。改颜色只改 theme.colors。
 *
 * 增加一种颜色时：
 * 1. 在 colors 里加字段
 * 2. 在 applyTheme 里 setProperty 对应的 daisyUI 变量（变量名见 https://daisyui.com/docs/colors/）
 * 3. 如果 naive-ui 也要用，在 naiveThemeOverrides 里加一项
 */
export const theme = {
  colors: {
    /** 主色：daisyUI 的 btn-primary / bg-primary，以及 naive-ui 的主色 */
    primary: '#635bff',
    /** 铺在主色上的文字，例如主按钮里的字 */
    onPrimary: '#ffffff',
  },
};

/** 把主题写到页面上，让 daisyUI 用同一套颜色。在 createApp 之前调用。 */
export function applyTheme() {
  const root = document.documentElement;
  // daisyUI 5 的 btn-primary、bg-primary 读这两个变量。
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-primary-content', theme.colors.onPrimary);
}

const primary = theme.colors.primary;

/**
 * 交给 App.vue 的 NConfigProvider。
 * naive-ui 的悬停、按下不会跟着主色走，不单独给色的话按钮悬停会回到默认绿。
 */
export const naiveThemeOverrides = {
  common: {
    primaryColor: primary,
    // 主色混一点白，作为悬停色。
    primaryColorHover: mix(primary, '#ffffff', 0.2),
    // 主色混一点黑，作为按下色。
    primaryColorPressed: mix(primary, '#000000', 0.15),
    primaryColorSuppl: primary,
  },
};

/** 把 hex 往另一个颜色上靠。amount 为 0 保持原色，为 1 变成目标色。 */
function mix(hex, target, amount) {
  const from = rgb(hex);
  const to = rgb(target);
  const mixed = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
  return '#' + mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}
