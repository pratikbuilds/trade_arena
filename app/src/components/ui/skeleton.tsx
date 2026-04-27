import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-[4px] bg-muted/45 shadow-[inset_0_1px_0_rgb(255_255_255/0.025)] before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.2s_linear_infinite] before:bg-linear-to-r before:from-transparent before:via-primary/10 before:to-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
