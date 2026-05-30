import { useMemo, useState } from "react";

import type { Tables } from "@/types/supabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Article = Tables<"articles_seen">;
type SortColumn = "title" | "source_url" | "seen_at" | "digest_sent_at";
type SortDirection = "asc" | "desc";

interface Props {
  articles: Article[];
}

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "title", label: "Tytuł" },
  { key: "source_url", label: "Źródło" },
  { key: "seen_at", label: "Zebrany" },
  { key: "digest_sent_at", label: "Status" },
];

function sortArticles(articles: Article[], column: SortColumn, direction: SortDirection): Article[] {
  return [...articles].sort((a, b) => {
    const aVal = a[column] ?? "";
    const bVal = b[column] ?? "";
    const cmp = aVal.localeCompare(bVal);
    return direction === "asc" ? cmp : -cmp;
  });
}

export default function ArticlesTable({ articles }: Props) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("seen_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sorted = useMemo(
    () => sortArticles(articles, sortColumn, sortDirection),
    [articles, sortColumn, sortDirection],
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

  function sourceHostname(url: string) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  function statusLabel(article: Article) {
    if (article.digest_sent_at) {
      return `Wysłano ${formatDate(article.digest_sent_at)}`;
    }
    return "Nowy";
  }

  return (
    <div className="w-full">
      {articles.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Brak artykułów.</p>
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((article) => (
              <TableRow key={article.id}>
                <TableCell>
                  <a
                    href={article.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary underline"
                  >
                    {article.title ?? article.article_url}
                  </a>
                </TableCell>
                <TableCell>{sourceHostname(article.source_url)}</TableCell>
                <TableCell>{formatDate(article.seen_at)}</TableCell>
                <TableCell>{statusLabel(article)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
