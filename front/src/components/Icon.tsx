import { CSSProperties } from 'react';

// UIで使うMaterial Symbols（Outlined / weight400 / optical20 / grade0 / fill0 に統一）。
// front/public/icons/<name>.svg として配置済み。名前を型で縛り、存在しないアイコンをコンパイルエラーにする
export type IconName =
  | 'brightness_auto'
  | 'light_mode'
  | 'dark_mode'
  | 'more_vert'
  | 'edit'
  | 'delete'
  | 'history'
  | 'close'
  | 'arrow_downward'
  | 'arrow_upward'
  | 'attach_file'
  | 'drag_indicator'
  | 'language'
  | 'menu';

// SVGをCSSマスクで切り抜き、bg-current（背景色 = currentColor）で塗りつぶすことで、
// 文字色・dark:・hover の色変化にアイコンが追随する（<img src> だと色を制御できない）。
// name が動的でTailwindの静的生成に載らないため、mask-image のURLだけはinline styleで与える。
// 装飾要素なので aria-hidden を付け、意味はボタン側の aria-label / title で与える（role は付けない）。
function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  const url = `url(/icons/${name}.svg)`;
  const style: CSSProperties = {
    maskImage: url,
    WebkitMaskImage: url,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskSize: 'contain',
    WebkitMaskSize: 'contain',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  };
  return <span aria-hidden="true" className={`inline-block shrink-0 bg-current ${className}`} style={style} />;
}

export default Icon;
