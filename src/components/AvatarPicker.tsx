import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Avatars 3D estil Pixar generats amb IA i pujats al bucket public "avatars/presets"
const SUPABASE_PUBLIC_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://sgonrrtqdcwyajsmufhs.supabase.co";
const AVATAR_BASE = `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/avatars/presets`;
export const PRESET_AVATARS: string[] = [
  1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,23,24,25,26,27,28,29,30,
].map((n) => `${AVATAR_BASE}/avatar-${n}.png`);

interface Props {
  userId: string;
  currentUrl: string | null;
  displayName: string;
  onChanged: (url: string) => void;
}

export function AvatarPicker({ userId, currentUrl, displayName, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const initial = (displayName || "?").trim().charAt(0).toUpperCase();

  async function persist(url: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("user_id", userId);
    if (error) throw error;
    onChanged(url);
  }

  async function handleFile(file: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imatge ha de pesar menys de 5 MB");
      return;
    }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      await persist(data.publicUrl);
      toast.success("Avatar actualitzat");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickPreset(url: string) {
    setBusy(true);
    try {
      await persist(url);
      toast.success("Avatar actualitzat");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="relative shrink-0 w-16 h-16 rounded-full border-2 border-primary/40 overflow-hidden bg-background/40 flex items-center justify-center hover:border-primary transition"
          aria-label="Canviar avatar"
        >
          {currentUrl ? (
            <img src={currentUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-gold">{initial}</span>
          )}
          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white py-0.5 text-center uppercase tracking-wider">
            Editar
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="w-[90vw] sm:max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border-primary/30">
        <DialogHeader>
          <DialogTitle className="text-gold font-title font-black italic">Foto de perfil</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="w-4 h-4 mr-2" /> Càmera
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon className="w-4 h-4 mr-2" /> Galeria
            </Button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="user"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <div>
            <div className="text-[10px] font-sans tracking-widest uppercase text-primary/85 mb-2">
              O tria un avatar
            </div>
            <div className="avatar-scroll max-h-[50vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-5 gap-2">
                {PRESET_AVATARS.map((url) => {
                  const selected = currentUrl === url;
                  return (
                    <button
                      key={url}
                      type="button"
                      disabled={busy}
                      onClick={() => pickPreset(url)}
                      className={`relative aspect-square rounded-full overflow-hidden border-2 transition ${
                        selected ? "border-gold" : "border-primary/30 hover:border-primary"
                      } bg-background/40`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {selected && (
                        <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Check className="w-5 h-5 text-gold" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {busy && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Desant…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}