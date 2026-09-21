"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import type { ArchivedMode, LibraryPlatform } from "@/lib/library/constants";
import type { LibraryPostFilters } from "@/lib/library/filters";
import type { LibraryTagCount } from "@/lib/api/entity-types";

const PLATFORM_OPTIONS: { value: LibraryPlatform | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "other", label: "Web" },
];

const CHIP_BASE =
  "rounded-full border px-3 py-1 font-mono text-xs transition-colors outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-indigo";
const chipClass = (active: boolean) =>
  `${CHIP_BASE} ${active ? "border-accent-indigo bg-accent-indigo/15 text-accent-indigo" : "border-panel-border text-text-secondary hover:border-panel-border-hover hover:text-text-primary"}`;

type Props = {
  filters: LibraryPostFilters;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  onChange: (patch: Partial<LibraryPostFilters>) => void;
  tags: LibraryTagCount[];
};

export function PostFilters({ filters, searchText, onSearchTextChange, onChange, tags }: Props) {
  const activeTags = filters.tags ?? [];
  const toggleTag = (tag: string) =>
    onChange({ tags: activeTags.includes(tag) ? activeTags.filter((existing) => existing !== tag) : [...activeTags, tag] });

  return (
    <section aria-label="Filter saved posts" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <Input
            type="search"
            aria-label="Search saved posts"
            placeholder="Search titles, notes, links, authors…"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
          />
        </div>

        <div role="group" aria-label="Platform" className="flex flex-wrap gap-1.5">
          {PLATFORM_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={filters.platform === option.value}
              onClick={() => onChange({ platform: option.value })}
              className={chipClass(filters.platform === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Switch checked={filters.favorite === true} onCheckedChange={(checked) => onChange({ favorite: checked || undefined })} label="Favorites" />

        <div className="w-40">
          <Select
            aria-label="Archived posts"
            value={filters.archived ?? "exclude"}
            onChange={(event) => onChange({ archived: event.target.value as ArchivedMode })}
          >
            <option value="exclude">Hide archived</option>
            <option value="only">Only archived</option>
            <option value="all">Include archived</option>
          </Select>
        </div>
      </div>

      {tags.length > 0 && (
        <div role="group" aria-label="Tags" className="flex flex-wrap gap-1.5">
          {tags.map(({ tag, n }) => (
            <button key={tag} type="button" aria-pressed={activeTags.includes(tag)} onClick={() => toggleTag(tag)} className={chipClass(activeTags.includes(tag))}>
              {tag} <span className="text-text-eyebrow">{n}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
