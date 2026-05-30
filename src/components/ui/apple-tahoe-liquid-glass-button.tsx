import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Optional WebP normal/displacement map (data URI) used by Chrome/Edge to
 * mathematically refract the backdrop (the real "liquid glass" lensing).
 *
 * Left empty by default — the component then falls back to a frosted blur
 * (identical to Safari's behaviour, which ignores the SVG displacement filter).
 *
 * To enable the Chrome refraction, paste the full `data:image/webp;base64,...`
 * string from the reference here.
 */
const WEBP_DISPLACEMENT_MAP = "";

const glassButtonVariants = cva(
  "relative isolate inline-flex items-center justify-center gap-2 rounded-full cursor-pointer transition-transform duration-300 ease-out tracking-tight disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50",
  {
    variants: {
      size: {
        default: "px-6 py-3.5 text-base font-medium",
        sm: "px-4 py-2 text-sm font-medium",
        lg: "px-8 py-4 text-lg font-medium",
        icon: "h-10 w-10 p-0 gap-0",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
  glassColor?: string; // e.g. "oklch(from var(--foreground) l c h / 10%)"
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, glassColor, ...props }, ref) => {
    // Generate a unique ID so multiple buttons don't conflict with each other's SVG filters
    const filterId = React.useId().replace(/:/g, "");
    const hasMap = WEBP_DISPLACEMENT_MAP.length > 0;

    // Chrome/Edge mathematically refract via the SVG filter; without a map (or on
    // Safari) we fall back to a plain frosted blur.
    const backdrop = hasMap
      ? `blur(8px) url(#liquid-glass-${filterId}) saturate(150%)`
      : `blur(8px) saturate(150%)`;

    return (
      <>
        {/* INVISIBLE SVG FILTER DEFINITION */}
        {/*
            primitiveUnits="objectBoundingBox" allows the 1x1 displacement map to seamlessly
            stretch and scale to fit ANY button size automatically without JS calculation.
        */}
        {hasMap && (
          <svg className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
            <filter id={`liquid-glass-${filterId}`} primitiveUnits="objectBoundingBox">
              <feImage
                result="map"
                width="100%"
                height="100%"
                x="0"
                y="0"
                href={WEBP_DISPLACEMENT_MAP}
                preserveAspectRatio="none"
              />
              {/* The pre-blur helps smooth out the underlying image before refraction */}
              <feGaussianBlur in="SourceGraphic" stdDeviation="0.01" result="blur" />
              <feDisplacementMap
                id="disp"
                in="blur"
                in2="map"
                scale="0.5"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </svg>
        )}

        <style>{`
          .btn-liquid-${filterId} {
            appearance: none;
            border: none;
            background: transparent;
            color: oklch(from var(--foreground) l c h / 95%);
            --glass-reflex-light: 1;
            --glass-reflex-dark: 1;
          }

          /*
             THE LENS LAYER (-z-10)
             This must remain completely empty of content.
             Because it is empty, Chrome's backdrop-filter engine will only grab
             the background behind the button, guaranteeing zero text-ghosting!
          */
          .btn-liquid-${filterId} .btn-liquid-lens {
            /* If no glassColor is provided, default to a subtle, neutral frosted glass */
            background-color: ${glassColor || "oklch(from var(--foreground) l c h / 5%)"};

            backdrop-filter: ${backdrop};
            -webkit-backdrop-filter: blur(8px) saturate(150%);

            /* The intricate, highly realistic Box Shadow stack from the CodePen */
            box-shadow:
              inset 0 0 0 1px color-mix(in srgb, white calc(var(--glass-reflex-light) * 10%), transparent),
              inset 1.8px 3px 0px -2px color-mix(in srgb, white calc(var(--glass-reflex-light) * 90%), transparent),
              inset -2px -2px 0px -2px color-mix(in srgb, white calc(var(--glass-reflex-light) * 80%), transparent),
              inset -3px -8px 1px -6px color-mix(in srgb, white calc(var(--glass-reflex-light) * 60%), transparent),
              inset -0.3px -1px 4px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 12%), transparent),
              inset -1.5px 2.5px 0px -2px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 20%), transparent),
              inset 0px 3px 4px -2px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 20%), transparent),
              inset 2px -6.5px 1px -4px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 10%), transparent),
              0px 1px 5px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 10%), transparent),
              0px 6px 16px 0px color-mix(in srgb, black calc(var(--glass-reflex-dark) * 8%), transparent);

            transition: background-color 400ms cubic-bezier(1, 0.0, 0.4, 1), box-shadow 400ms cubic-bezier(1, 0.0, 0.4, 1);
          }

          /* Text Layer: Floats cleanly above the glass */
          .btn-liquid-${filterId} .btn-liquid-text {
            text-shadow: 0 1px 2px oklch(from var(--background) l c h / 30%);
            transition: color 400ms cubic-bezier(1, 0.0, 0.4, 1);
          }

          /* Hover & Active Interactions */
          @media (hover: hover) {
            .btn-liquid-${filterId}:not(:disabled):hover {
              transform: scale(1.03);
            }
          }
          .btn-liquid-${filterId}:not(:disabled):active {
            transform: scale(0.96);
          }
        `}</style>

        <button
          className={cn(glassButtonVariants({ size }), `btn-liquid-${filterId}`, className)}
          ref={ref}
          {...props}
        >
          {/* ISOLATED BACKGROUND LENS */}
          <span className="btn-liquid-lens absolute inset-0 -z-10 rounded-[inherit] pointer-events-none" />

          {/* TEXT CONTENT (Composited safely ABOVE the backdrop filter) */}
          <span className={cn("btn-liquid-text relative z-10 w-full flex items-center justify-center gap-[inherit] select-none", contentClassName)}>
            {children}
          </span>
        </button>
      </>
    );
  }
);
GlassButton.displayName = "GlassButton";

// eslint-disable-next-line react-refresh/only-export-components
export { GlassButton, glassButtonVariants };
