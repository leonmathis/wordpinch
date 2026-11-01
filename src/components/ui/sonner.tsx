"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-shape-sage" />
        ),
        info: (
          <InfoIcon className="size-4 text-shape-blue" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-shape-yellow" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-shape-pink" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          // Inverted pills: ink on the light theme, cream on the dark one.
          "--normal-bg": "var(--foreground)",
          "--normal-text": "var(--background)",
          "--normal-border": "transparent",
          "--border-radius": "999px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
