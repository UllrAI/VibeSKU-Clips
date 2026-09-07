"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Archive,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/search-input";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "@/components/ugc/image-field";
import { actionMessageKey } from "@/components/ugc/action-message";
import { StatusBadge } from "@/components/ugc/status-badge";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  archiveTalent,
  createTalent,
  retryTalentGeneration,
} from "@/lib/ugc/actions";
import type { TalentRow } from "@/lib/ugc/queries";

export function TalentLibrary({ talents }: { talents: TalentRow[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [formPending, startFormTransition] = useTransition();
  const [actionPending, startActionTransition] = useTransition();
  const [actingTalentId, setActingTalentId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    type: "regenerate" | "archive";
    talent: TalentRow;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!talents.some((talent) => talent.status === "generating")) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [router, talents]);

  const reset = () => {
    setName("");
    setImages([]);
    setDescription("");
  };

  const submit = () =>
    startFormTransition(async () => {
      const result = await createTalent({
        name: name.trim(),
        description: description.trim(),
        referenceImages: images,
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_talent_generation_started"));
      setOpen(false);
      reset();
      router.refresh();
    });

  const retry = (talentId: string) => {
    setActingTalentId(talentId);
    startActionTransition(async () => {
      try {
        const result = await retryTalentGeneration(talentId);
        if (!result.ok) {
          toast.error(t(actionMessageKey(result.code)));
          return;
        }
        toast.success(t("ugc_talent_generation_started"));
        router.refresh();
      } finally {
        setActingTalentId(null);
      }
    });
  };

  const archive = (talentId: string) => {
    setActingTalentId(talentId);
    startActionTransition(async () => {
      try {
        const result = await archiveTalent(talentId);
        if (!result.ok) {
          toast.error(t(actionMessageKey(result.code)));
          return;
        }
        toast.success(t("ugc_talent_archived"));
        router.refresh();
      } finally {
        setActingTalentId(null);
      }
    });
  };

  const confirmAction = () => {
    if (!confirmation) return;
    const { type, talent } = confirmation;
    setConfirmation(null);
    if (type === "regenerate") retry(talent.id);
    else archive(talent.id);
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visible = talents.filter((talent) =>
    `${talent.name} ${talent.description} ${talent.prompt ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder={t("ugc_talent_search_placeholder")}
          clearLabel={t("ugc_common_clear_search")}
          className="w-full max-w-xs"
        />
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {t("ugc_talent_new_title")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          spacing="compact"
          icon={<Users />}
          title={t(query ? "ugc_common_no_matches" : "ugc_talent_empty_title")}
          description={t(
            query ? "ugc_common_no_matches_hint" : "ugc_talent_empty_hint",
          )}
          action={
            query ? undefined : (
              <Button size="sm" onClick={() => setOpen(true)}>
                {t("ugc_talent_new_title")}
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visible.map((talent) => (
            <li key={talent.id}>
              <Card className="h-full gap-3 py-3">
                <CardContent className="space-y-3 px-3">
                  <div className="border-border bg-muted relative aspect-[4/5] overflow-hidden rounded-md border">
                    {talent.imageUrl ? (
                      <Image
                        src={talent.imageUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1536px) 200px, (min-width: 1280px) 240px, (min-width: 1024px) 30vw, 45vw"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm">
                        {talent.status === "generating" && (
                          <Loader2
                            className="size-5 animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                        )}
                        <span>
                          {t(
                            talent.status === "failed"
                              ? "ugc_talent_generation_failed"
                              : "ugc_talent_generating",
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1.5">
                      <h3 className="truncate text-sm font-medium">
                        {talent.name}
                      </h3>
                      <StatusBadge kind="talent" status={talent.status} />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="size-11 sm:size-8"
                          disabled={
                            actionPending && actingTalentId === talent.id
                          }
                        >
                          {actionPending && actingTalentId === talent.id ? (
                            <Loader2
                              className="animate-spin motion-reduce:animate-none"
                              aria-hidden
                            />
                          ) : (
                            <MoreHorizontal aria-hidden />
                          )}
                          <span className="sr-only">
                            {t("ugc_common_actions")}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {talent.status !== "generating" && (
                          <DropdownMenuItem
                            onSelect={() =>
                              setConfirmation({ type: "regenerate", talent })
                            }
                          >
                            <RefreshCw />
                            {t("ugc_talent_retry")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            setConfirmation({ type: "archive", talent })
                          }
                        >
                          <Archive />
                          {t("ugc_talent_archive")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                    {talent.prompt ?? talent.description}
                  </p>
                  {talent.status === "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={actionPending && actingTalentId === talent.id}
                      onClick={() =>
                        setConfirmation({ type: "regenerate", talent })
                      }
                    >
                      <RefreshCw />
                      {t("ugc_talent_retry")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => !formPending && setOpen(nextOpen)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("ugc_talent_new_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_talent_form_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="talent-name">{t("ugc_talent_name")}</Label>
              <Input
                id="talent-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <ImageField
              value={images}
              onChange={setImages}
              maxFiles={1}
              label={t("ugc_talent_reference_image")}
            />
            <div className="space-y-2">
              <Label htmlFor="talent-description">
                {t("ugc_talent_appearance")}
              </Label>
              <Textarea
                id="talent-description"
                rows={8}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("ugc_talent_appearance_placeholder")}
              />
              <p className="text-muted-foreground text-xs">
                {t("ugc_talent_generated_hint")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={formPending}
            >
              {t("ugc_common_cancel")}
            </Button>
            <Button
              onClick={submit}
              disabled={formPending || !name.trim() || !description.trim()}
            >
              {formPending && <Loader2 className="animate-spin" aria-hidden />}
              {t("ugc_talent_generate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmation)}
        onOpenChange={(nextOpen) => !nextOpen && setConfirmation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(
                confirmation?.type === "archive"
                  ? "ugc_talent_archive_confirm_title"
                  : "ugc_talent_regenerate_confirm_title",
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                confirmation?.type === "archive"
                  ? "ugc_talent_archive_confirm_hint"
                  : "ugc_talent_regenerate_confirm_hint",
                { name: confirmation?.talent.name ?? "" },
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              {t("ugc_common_cancel")}
            </Button>
            <Button
              variant={
                confirmation?.type === "archive" ? "destructive" : "default"
              }
              onClick={confirmAction}
            >
              {t(
                confirmation?.type === "archive"
                  ? "ugc_talent_archive"
                  : "ugc_talent_retry",
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
