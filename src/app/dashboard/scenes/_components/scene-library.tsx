"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Archive,
  Loader2,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
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
import { sceneAngleKey } from "@/components/ugc/labels";
import { StatusBadge } from "@/components/ugc/status-badge";
import { ViewStrip } from "@/components/ugc/view-strip";
import { useTranslation } from "@/lib/i18n/translation/client";
import {
  archiveScene,
  createScene,
  retrySceneGeneration,
} from "@/lib/ugc/actions";
import { SCENE_ANGLES } from "@/lib/ugc/constants";
import type { SceneRow } from "@/lib/ugc/queries";

export function SceneLibrary({ scenes }: { scenes: SceneRow[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [formPending, startFormTransition] = useTransition();
  const [actionPending, startActionTransition] = useTransition();
  const [actingSceneId, setActingSceneId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    type: "regenerate" | "archive";
    scene: SceneRow;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!scenes.some((scene) => scene.status === "generating")) return;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [router, scenes]);

  const reset = () => {
    setName("");
    setImages([]);
    setDescription("");
  };

  const submit = () =>
    startFormTransition(async () => {
      const result = await createScene({
        name: name.trim(),
        description: description.trim(),
        referenceImages: images,
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_scene_generation_started"));
      setOpen(false);
      reset();
      router.refresh();
    });

  const runAction = (
    sceneId: string,
    action: () => Promise<{ ok: boolean; code?: string }>,
    successKey: string,
  ) => {
    setActingSceneId(sceneId);
    startActionTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(t(actionMessageKey(result.code)));
          return;
        }
        toast.success(t(successKey));
        router.refresh();
      } finally {
        setActingSceneId(null);
      }
    });
  };

  const confirmAction = () => {
    if (!confirmation) return;
    const { type, scene } = confirmation;
    setConfirmation(null);
    if (type === "regenerate") {
      runAction(
        scene.id,
        () => retrySceneGeneration(scene.id),
        "ugc_scene_generation_started",
      );
    } else {
      runAction(scene.id, () => archiveScene(scene.id), "ugc_scene_archived");
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visible = scenes.filter((scene) =>
    `${scene.name} ${scene.description} ${scene.prompt ?? ""}`
      .toLowerCase()
      .includes(normalizedQuery),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder={t("ugc_scene_search_placeholder")}
          clearLabel={t("ugc_common_clear_search")}
          className="w-full max-w-xs"
        />
        <Button onClick={() => setOpen(true)}>
          <Plus />
          {t("ugc_scene_new_title")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          spacing="compact"
          icon={<MapPin />}
          title={t(query ? "ugc_common_no_matches" : "ugc_scene_empty_title")}
          description={t(
            query ? "ugc_common_no_matches_hint" : "ugc_scene_empty_hint",
          )}
          action={
            query ? undefined : (
              <Button size="sm" onClick={() => setOpen(true)}>
                {t("ugc_scene_new_title")}
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visible.map((scene) => {
            const busy = actionPending && actingSceneId === scene.id;
            const [cover, ...otherViews] = scene.views;
            return (
              <li key={scene.id}>
                <Card className="h-full gap-3 py-3">
                  <CardContent className="space-y-3 px-3">
                    <div className="border-border bg-muted relative aspect-square overflow-hidden rounded-md border">
                      {cover ? (
                        <Image
                          src={cover.imageUrl}
                          alt=""
                          fill
                          sizes="(min-width: 1536px) 200px, (min-width: 1280px) 240px, (min-width: 1024px) 30vw, 45vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm">
                          {scene.status === "generating" && (
                            <Loader2
                              className="size-5 animate-spin motion-reduce:animate-none"
                              aria-hidden
                            />
                          )}
                          <span>
                            {t(
                              scene.status === "failed"
                                ? "ugc_scene_generation_failed"
                                : "ugc_scene_generating",
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    <ViewStrip
                      views={otherViews}
                      labelKey={sceneAngleKey}
                      drawing={scene.status === "generating"}
                    />

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1.5">
                        <h3 className="truncate text-sm font-medium">
                          {scene.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge kind="scene" status={scene.status} />
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {t("ugc_view_count", {
                              count: scene.views.length,
                              total: SCENE_ANGLES.length,
                            })}
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-11 sm:size-8"
                            disabled={busy}
                          >
                            {busy ? (
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
                          {scene.status !== "generating" && (
                            <DropdownMenuItem
                              onSelect={() =>
                                setConfirmation({ type: "regenerate", scene })
                              }
                            >
                              <RefreshCw />
                              {t("ugc_scene_retry")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() =>
                              setConfirmation({ type: "archive", scene })
                            }
                          >
                            <Archive />
                            {t("ugc_scene_archive")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                      {scene.prompt ?? scene.description}
                    </p>
                    {scene.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={() =>
                          setConfirmation({ type: "regenerate", scene })
                        }
                      >
                        <RefreshCw />
                        {t("ugc_scene_retry")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => !formPending && setOpen(nextOpen)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("ugc_scene_new_title")}</DialogTitle>
            <DialogDescription>
              {t("ugc_scene_form_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scene-name">{t("ugc_scene_name")}</Label>
              <Input
                id="scene-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <ImageField
              value={images}
              onChange={setImages}
              maxFiles={3}
              label={t("ugc_scene_reference_images")}
            />
            <div className="space-y-2">
              <Label htmlFor="scene-description">
                {t("ugc_scene_appearance")}
              </Label>
              <Textarea
                id="scene-description"
                rows={8}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("ugc_scene_appearance_placeholder")}
              />
              <p className="text-muted-foreground text-xs">
                {t("ugc_scene_generated_hint")}
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
              {t("ugc_scene_generate")}
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
                  ? "ugc_scene_archive_confirm_title"
                  : "ugc_scene_regenerate_confirm_title",
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                confirmation?.type === "archive"
                  ? "ugc_scene_archive_confirm_hint"
                  : "ugc_scene_regenerate_confirm_hint",
                { name: confirmation?.scene.name ?? "" },
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
                  ? "ugc_scene_archive"
                  : "ugc_scene_retry",
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
