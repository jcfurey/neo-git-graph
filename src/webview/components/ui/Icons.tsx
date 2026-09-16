import type { ComponentChildren, SVGAttributes } from "preact";

type IconProps = Omit<SVGAttributes<SVGSVGElement>, "children">;

export function Icon({ children, ...props }: IconProps & { children: ComponentChildren }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Marks a control that opens a list or a menu below itself. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.976 10.072L12.333 5.715L12.953 6.333L8.284 11H7.666L3 6.333L3.619 5.715L7.976 10.072Z" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-.761l.302-.954A6 6 0 1 1 4.681 3z" />
    </Icon>
  );
}

/** Marks a control that opens the actions of the row it sits in. */
export function KebabIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="3" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="13" cy="8" r="1.25" />
    </Icon>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.5",
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
} as const;

/** Eight teeth on a ring around a hub read as a gear at 16px. */
export function GearIcon(props: IconProps) {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315].map((degrees) => {
    const angle = (degrees * Math.PI) / 180;
    return {
      x1: (8 + 4.6 * Math.cos(angle)).toFixed(2),
      y1: (8 + 4.6 * Math.sin(angle)).toFixed(2),
      x2: (8 + 7 * Math.cos(angle)).toFixed(2),
      y2: (8 + 7 * Math.sin(angle)).toFixed(2)
    };
  });
  return (
    <Icon {...props} {...STROKE}>
      <circle cx="8" cy="8" r="4.6" />
      <circle cx="8" cy="8" r="1.8" />
      {teeth.map((line) => (
        <line key={line.x1 + line.y1} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      ))}
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props} {...STROKE}>
      <path d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </Icon>
  );
}

export function EyeClosedIcon(props: IconProps) {
  return (
    <Icon {...props} {...STROKE}>
      <path d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z" />
      <path d="M3 13L13 3" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props} {...STROKE}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  );
}

export function BranchIcon(props: IconProps) {
  return (
    <Icon {...props} viewBox="0 0 10 16">
      <path d="M10 5c0-1.11-.89-2-2-2a1.993 1.993 0 0 0-1 3.72v.3c-.02.52-.23.98-.63 1.38-.4.4-.86.61-1.38.63-.83.02-1.48.16-2 .45V4.72a1.993 1.993 0 0 0-1-3.72C.88 1 0 1.89 0 3a2 2 0 0 0 1 1.72v6.56c-.59.35-1 .99-1 1.72 0 1.11.89 2 2 2 1.11 0 2-.89 2-2 0-.53-.2-1-.53-1.36.09-.06.48-.41.59-.47.25-.11.56-.17.94-.17 1.05-.05 1.95-.45 2.75-1.25S8.95 7.77 9 6.73h-.02C9.59 6.37 10 5.73 10 5zM2 1.8c.66 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2C1.35 4.2.8 3.65.8 3c0-.65.55-1.2 1.2-1.2zm0 12.41c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2zm6-8c-.66 0-1.2-.55-1.2-1.2 0-.65.55-1.2 1.2-1.2.65 0 1.2.55 1.2 1.2 0 .65-.55 1.2-1.2 1.2z" />
    </Icon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Icon {...props} viewBox="0 0 15 16">
      <path d="M7.73 1.73C7.26 1.26 6.62 1 5.96 1H3.5C2.13 1 1 2.13 1 3.5v2.47c0 .66.27 1.3.73 1.77l6.06 6.06c.39.39 1.02.39 1.41 0l4.59-4.59a.996.996 0 0 0 0-1.41L7.73 1.73zM2.38 7.09c-.31-.3-.47-.7-.47-1.13V3.5c0-.88.72-1.59 1.59-1.59h2.47c.42 0 .83.16 1.13.47l6.14 6.13-4.73 4.73-6.13-6.15zM3.01 3h2v2H3V3h.01z" />
    </Icon>
  );
}

/** A box with a lid, for the stash list. */
export function StashIcon(props: IconProps) {
  return (
    <Icon {...props} {...STROKE}>
      <path d="M2.5 4.5h11v3h-11z" />
      <path d="M3.5 7.5v5h9v-5" />
      <path d="M6.5 10h3" />
    </Icon>
  );
}

/** A cloud, for a remote and its branches. */
export function RemoteIcon(props: IconProps) {
  return (
    <Icon {...props} {...STROKE}>
      <path d="M4.5 12.5h7a2.75 2.75 0 0 0 .4-5.47A4 4 0 0 0 4.2 8.1a2.25 2.25 0 0 0 .3 4.4Z" />
    </Icon>
  );
}
