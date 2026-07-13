"use client";

import * as Avatar from "@radix-ui/react-avatar";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
type Presence = "online" | "busy" | "offline";

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-[10px]",
  md: "size-9 text-xs",
  lg: "size-11 text-sm",
  xl: "size-16 text-lg",
};

const PRESENCE_CLASS: Record<Presence, string> = {
  online: "bg-emerald-500",
  busy: "bg-amber-500",
  offline: "bg-slate-400",
};

const FALLBACK_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
];

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function fallbackColor(name: string): string {
  const hash = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export default function UserAvatar({
  name,
  avatarUrl,
  size = "md",
  presence,
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: AvatarSize;
  presence?: Presence;
  className?: string;
}) {
  return (
    <Avatar.Root
      className={`relative inline-grid shrink-0 place-items-center overflow-visible rounded-full font-bold ${SIZE_CLASS[size]} ${className}`}
      title={name}
      role="img"
      aria-label={name}
    >
      {avatarUrl && (
        <Avatar.Image
          src={avatarUrl}
          alt=""
          className="size-full rounded-full object-cover ring-1 ring-black/5"
        />
      )}
      <Avatar.Fallback
        className={`grid size-full place-items-center rounded-full ${fallbackColor(name)}`}
        delayMs={avatarUrl ? 150 : 0}
        aria-hidden="true"
      >
        {initials(name)}
      </Avatar.Fallback>
      {presence && (
        <span
          className={`absolute bottom-0 right-0 size-[28%] min-h-2 min-w-2 rounded-full border-2 border-white ${PRESENCE_CLASS[presence]}`}
          aria-hidden="true"
        />
      )}
    </Avatar.Root>
  );
}
