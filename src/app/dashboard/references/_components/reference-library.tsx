"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clapperboard,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { actionMessageKey } from "@/components/ugc/action-message";
import { contentLocaleKey, LOCALE_OPTIONS } from "@/components/ugc/labels";
import { ReferenceStatusBadge } from "@/components/ugc/reference-status-badge";
import { VideoField } from "@/components/ugc/video-field";
import { useTranslation } from "@/lib/i18n/translation/client";
import { createReference, deleteReference } from "@/lib/ugc/reference-actions";
import type { ReferenceRow } from "@/lib/ugc/queries";

type Intake = "upload" | "url";

/**
 * The shelf of pieces worth rebuilding. A reference is only useful once it has
 * been read, so every card leads to its blueprint rather than to the file.
 */
export function ReferenceLibrary({
  references,
}: {
  references: ReferenceRow[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [intake, setIntake] = useState<Intake>("upload");
  const [title, setTitle] = useState("");
  const [locale, setLocale] = useState<string>("en");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [deleting, setDeleting] = useState<ReferenceRow | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = Boolean(
    title.trim() &&
    rights &&
    (intake === "upload" ? videoUrl : sourceUrl.trim()),
  );

  const reset = () => {
    setTitle("");
    setVideoUrl(null);
    setSourceUrl("");
    setRights(false);
    setIntake("upload");
  };

  const submit = () =>
    startTransition(async () => {
      const result = await createReference({
        title: title.trim(),
        locale,
        rightsAcknowledged: true,
        ...(intake === "upload"
          ? { videoUrl: videoUrl ?? undefined }
          : { sourceUrl: sourceUrl.trim() }),
      });
      if (!result.ok || !result.id) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      setOpen(false);
      reset();
      router.push(`/dashboard/references/${result.id}`);
    });

  const remove = (reference: ReferenceRow) =>
    startTransition(async () => {
      setDeleting(null);
      const result = await deleteReference(reference.id);
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_reference_deleted"));
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {t("ugc_reference_new_title")}
        </Button>
      </div>

      {references.length === 0 ? (
        <EmptyState
          spacing="compact"
          icon={<Clapperboard />}
          title={t("ugc_reference_empty_title")}
          description={t("ugc_reference_empty_hint")}
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              {t("ugc_reference_new_title")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {references.map((reference) => (
            <li key={reference.id}>
              <Card className="h-full gap-3 py-3">
                <CardContent className="space-y-3 px-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1.5">
                      <Link
                        href={`/dashboard/references/${reference.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {reference.title}
                      </Link>
                      <ReferenceStatusBadge status={reference.status} />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-11 sm:size-8"
                        >
                          <MoreHorizontal aria-hidden />
                          <span className="sr-only">
                            {t("ugc_common_actions")}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/dashboard/references/${reference.id}`}>
                            <RefreshCw />
                            {t("ugc_reference_open")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setDeleting(reference)}
                        >
                          <Trash2 />
                          {t("ugc_reference_delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    {reference.source === "url" ? (
                      <Link2 className="size-3.5 shrink-0" aria-hidden />
                    ) : (
                      <Upload className="size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="truncate" translate="no">
                      {reference.sourceUrl ?? t("ugc_reference_source_upload")}
                    </span>
                  </p>
                  {reference.blueprint ? (
                    <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                      {reference.blueprint.hook}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {t(
                        reference.status === "failed"
                          ? "ugc_reference_read_failed_short"
                          : "ugc_reference_reading_short",
                      )}
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("ugc_reference_new_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_reference_new_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Tabs
              value={intake}
              onValueChange={(value) => setIntake(value as Intake)}
            >
              <TabsList className="w-full">
                <TabsTrigger value="upload" className="flex-1">
                  {t("ugc_reference_intake_upload")}
                </TabsTrigger>
                <TabsTrigger value="url" className="flex-1">
                  {t("ugc_reference_intake_url")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {intake === "upload" ? (
              <VideoField
                value={videoUrl}
                onChange={setVideoUrl}
                label={t("ugc_reference_file_label")}
              />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="reference-source-url">
                  {t("ugc_reference_url_label")}
                </Label>
                <Input
                  id="reference-source-url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://"
                  inputMode="url"
                  translate="no"
                />
                <p className="text-muted-foreground text-xs">
                  {t("ugc_reference_url_hint")}
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reference-title">
                  {t("ugc_reference_title_label")}
                </Label>
                <Input
                  id="reference-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("ugc_reference_title_placeholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference-locale">
                  {t("ugc_reference_locale_label")}
                </Label>
                <Select value={locale} onValueChange={setLocale}>
                  <SelectTrigger id="reference-locale" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(contentLocaleKey(option))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={rights}
                onCheckedChange={(value) => setRights(value === true)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground leading-relaxed">
                {t("ugc_reference_rights_statement")}
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {t("ugc_common_cancel")}
            </Button>
            <Button onClick={submit} disabled={!ready || pending}>
              {pending && (
                <Loader2
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              )}
              {t("ugc_reference_start_reading")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(value) => !value && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ugc_reference_delete_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_reference_delete_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t("ugc_common_cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && remove(deleting)}
            >
              {t("ugc_reference_delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
