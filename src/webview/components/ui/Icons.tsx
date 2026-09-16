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
