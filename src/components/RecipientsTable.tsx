import { useMemo, useState } from "react";

import type { Tables } from "@/types/supabase";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import RecipientForm from "@/components/RecipientForm";

type Recipient = Tables<"mailing_recipients">;
type SortColumn = "email" | "name" | "status" | "created_at";
type SortDirection = "asc" | "desc";

interface Props {
  recipients: Recipient[];
}

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "name", label: "Imię" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Dodano" },
];

function sortRecipients(recipients: Recipient[], column: SortColumn, direction: SortDirection): Recipient[] {
  return [...recipients].sort((a, b) => {
    const aVal = a[column] ?? "";
    const bVal = b[column] ?? "";
    const cmp = aVal.localeCompare(bVal);
    return direction === "asc" ? cmp : -cmp;
  });
}

export default function RecipientsTable({ recipients: initial }: Props) {
  const [recipients, setRecipients] = useState<Recipient[]>(initial);
  const [sortColumn, setSortColumn] = useState<SortColumn>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Recipient | null>(null);
  const [formKey, setFormKey] = useState(0);

  const [deleting, setDeleting] = useState<Recipient | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const sorted = useMemo(
    () => sortRecipients(recipients, sortColumn, sortDirection),
    [recipients, sortColumn, sortDirection],
  );

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("pl-PL");
  }

  function statusLabel(status: string) {
    return status === "active" ? "Aktywny" : "Wypisany";
  }

  function openAdd() {
    setEditing(null);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  function openEdit(recipient: Recipient) {
    setEditing(recipient);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  function handleSaved(saved: Recipient) {
    setRecipients((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/recipients/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setDeleteError(body.error ?? "Nie udało się usunąć odbiorcy.");
        return;
      }
      setRecipients((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleting(null);
    } catch {
      setDeleteError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="flex justify-end p-4">
        <Button onClick={openAdd}>Dodaj odbiorcę</Button>
      </div>

      {recipients.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Brak odbiorców.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map(({ key, label }) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none"
                  onClick={() => {
                    handleSort(key);
                  }}
                >
                  {label}
                  {sortColumn === key && <span className="ml-1 text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                </TableHead>
              ))}
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((recipient) => (
              <TableRow key={recipient.id}>
                <TableCell>{recipient.email}</TableCell>
                <TableCell>{recipient.name?.trim() ? recipient.name : "—"}</TableCell>
                <TableCell>{statusLabel(recipient.status)}</TableCell>
                <TableCell>{formatDate(recipient.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        openEdit(recipient);
                      }}
                    >
                      Edytuj
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleting(recipient);
                      }}
                    >
                      Usuń
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <RecipientForm key={formKey} open={formOpen} onOpenChange={setFormOpen} initial={editing} onSaved={handleSaved} />

      <Dialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usuń odbiorcę</DialogTitle>
            <DialogDescription>
              Czy na pewno trwale usunąć {deleting?.email}? Tej operacji nie można cofnąć.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Anuluj</Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "Usuwanie…" : "Usuń"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
