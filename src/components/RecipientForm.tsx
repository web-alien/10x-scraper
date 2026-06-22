import { useState } from "react";

import type { Tables } from "@/types/supabase";
import { recipientSchema } from "@/lib/validators/recipient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Recipient = Tables<"mailing_recipients">;
type Status = "active" | "unsubscribed";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Recipient | null;
  onSaved: (recipient: Recipient) => void;
}

// Parent remounts this component (via `key`) on each open, so useState initializers
// pick up the right record — no prop→state syncing effect needed.
export default function RecipientForm({ open, onOpenChange, initial, onSaved }: Props) {
  const [email, setEmail] = useState(initial?.email ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [status, setStatus] = useState<Status>(initial ? (initial.status as Status) : "active");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);

    const payload = { email: email.trim(), name: name.trim() ? name.trim() : undefined, status };
    const parsed = recipientSchema.safeParse(payload);
    if (!parsed.success) {
      setError("Podaj poprawny adres e-mail.");
      return;
    }

    const url = initial ? `/api/recipients/${initial.id}` : "/api/recipients";
    const method = initial ? "PUT" : "POST";

    setSubmitting(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json().catch(() => ({}))) as { recipient?: Recipient; error?: string };
      if (!res.ok || !body.recipient) {
        setError(body.error ?? "Nie udało się zapisać odbiorcy.");
        return;
      }
      onSaved(body.recipient);
      onOpenChange(false);
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Edytuj odbiorcę" : "Dodaj odbiorcę"}</DialogTitle>
          <DialogDescription>Odbiorca mailingu — adres e-mail jest wymagany.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="recipient-email">Email</Label>
            <Input
              id="recipient-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recipient-name">Imię</Label>
            <Input
              id="recipient-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="recipient-status">Status</Label>
            <select
              id="recipient-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Status);
              }}
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="active">Aktywny</option>
              <option value="unsubscribed">Wypisany</option>
            </select>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
