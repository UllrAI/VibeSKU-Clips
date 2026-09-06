"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Archive, Loader2, Plus, RefreshCw, Users } from "lucide-react";
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
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
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
    startTransition(async () => {
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {t("ugc_talent_new_title")}
        </Button>
      </div>

      {talents.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t("ugc_talent_empty_title")}
          description={t("ugc_talent_empty_hint")}
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              {t("ugc_talent_new_title")}
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {talents.map((talent) => (
            <li key={talent.id}>
              <Card className="h-full">
                <CardContent className="space-y-3 pt-6">
                  <div className="border-border bg-muted relative aspect-[3/4] overflow-hidden rounded-md border">
                    {talent.imageUrl ? (
                      <Image
                        src={talent.imageUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 240px, 45vw"
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{talent.name}</span>
                    <StatusBadge kind="talent" status={talent.status} />
                  </div>
                  <p className="text-muted-foreground line-clamp-3 text-sm">
                    {talent.prompt ?? talent.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {talent.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await retryTalentGeneration(
                              talent.id,
                            );
                            if (!result.ok) {
                              toast.error(t(actionMessageKey(result.code)));
                              return;
                            }
                            toast.success(t("ugc_talent_generation_started"));
                            router.refresh();
                          })
                        }
                      >
                        <RefreshCw />
                        {t("ugc_talent_retry")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await archiveTalent(talent.id);
                          toast.success(t("ugc_talent_archived"));
                          router.refresh();
                        })
                      }
                    >
                      <Archive />
                      {t("ugc_talent_archive")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
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
              disabled={pending}
            >
              {t("ugc_common_cancel")}
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !name.trim() || !description.trim()}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {t("ugc_talent_generate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
