import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check } from "lucide-react";
import { sanitizeName } from "@/hooks/usePlayerIdentity";

/**
 * Camp d'edició de nom: mostra el nom actual i permet editar-lo. Sense email
 * ni dades personals.
 */
export function PlayerNameField({
  name, onChange, label = "El teu nom",
}: {
  name: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const [editing, setEditing] = useState(name.length === 0);
  const [draft, setDraft] = useState(name);

  useEffect(() => { setDraft(name); }, [name]);

  const save = () => {
    const clean = sanitizeName(draft);
    if (!clean) return;
    onChange(clean);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2 rounded-lg border-2 border-primary/30 bg-background/40">
          <span className="text-[10px] font-display tracking-widest uppercase text-primary/70 block">{label}</span>
          <span className="font-display font-bold text-base text-foreground">{name}</span>
        </div>
        <Button type="button" size="icon" variant="outline" onClick={() => setEditing(true)} aria-label="Modificar nom">
          <Pencil className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-display tracking-widest uppercase text-primary/70">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={24}
          autoFocus
          placeholder="Escriu el teu nom"
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        <Button type="button" size="icon" onClick={save} aria-label="Desar nom" disabled={!sanitizeName(draft)}>
          <Check className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Sense email ni dades personals. Es recorda al teu dispositiu.</p>
    </div>
  );
}