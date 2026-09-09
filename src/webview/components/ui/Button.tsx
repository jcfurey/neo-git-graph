import type { ComponentProps } from "preact";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "default" | "primary";
};

export function Button({ class: className, type, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      class={[
        "inline-flex cursor-pointer items-center justify-center gap-1 select-none",
        "rounded-sm border px-2.5 py-1 text-ui font-medium focus:outline-1 focus:outline-focus",
        variant === "primary"
          ? "border-transparent bg-action text-action-fg not-disabled:hover:bg-action-hover"
          : "border-line bg-btn not-disabled:hover:bg-btn-hover",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
