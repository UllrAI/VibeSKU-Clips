"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SquarePen } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { actionMessageKey } from "@/components/ugc/action-message";
import {
  contentLocaleKey,
  marketKey,
  templateKey,
} from "@/components/ugc/labels";
import { useTranslation } from "@/lib/i18n/translation/client";
import { saveScriptRevision } from "@/lib/ugc/actions";
import type { ScriptRow } from "@/lib/ugc/queries";

type ScriptWithProduct = ScriptRow & { productName: string };

export function ScriptLibrary({ scripts }: { scripts: ScriptWithProduct[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<ScriptWithProduct | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    hook: "",
    voiceover: "",
    captions: "",
    publishCaption: "",
    lock: false,
  });

  const openEditor = (script: ScriptWithProduct) => {
    setEditing(script);
    setDraft({
      title: script.title,
      hook: script.hook,
      voiceover: script.voiceover,
      captions: script.captions.join("\n"),
      publishCaption: script.publishCaption ?? "",
      lock: script.status === "locked",
    });
  };

  const submit = () => {
    if (!editing) return;
    startTransition(async () => {
      const result = await saveScriptRevision(editing.id, {
        title: draft.title.trim(),
        hook: draft.hook.trim(),
        voiceover: draft.voiceover.trim(),
        captions: draft.captions
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        publishCaption: draft.publishCaption.trim() || undefined,
        lock: draft.lock,
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_script_revision_saved"));
      setEditing(null);
      router.refresh();
    });
  };

  if (scripts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm font-medium">{t("ugc_scripts_empty_title")}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("ugc_scripts_empty_hint")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ul className="grid gap-4 lg:grid-cols-2">
        {scripts.map((script) => (
          <li key={script.id}>
            <Card className="h-full">
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{script.title}</h3>
                  <Badge variant="outline">v{script.version}</Badge>
                  {script.status === "locked" && (
                    <Badge variant="secondary">{t("ugc_script_locked")}</Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">
                  {[
                    script.productName,
                    t(contentLocaleKey(script.locale)),
                    t(marketKey(script.market)),
                    t(templateKey(script.template)),
                  ].join(" · ")}
                </p>
                <p className="text-sm">{script.hook}</p>
                <ol className="text-muted-foreground space-y-1 text-sm">
                  {script.beats.map((beat, index) => (
                    <li key={`${script.id}-${index}`}>
                      <span className="font-mono text-xs">
                        {beat.start.toFixed(1)}–{beat.end.toFixed(1)}s
                      </span>{" "}
                      {beat.voiceover || beat.action}
                    </li>
                  ))}
                </ol>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEditor(script)}
                >
                  <SquarePen />
                  {t("ugc_script_edit")}
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("ugc_script_edit")}</DialogTitle>
            <DialogDescription>
              {t("ugc_script_edit_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="script-title">{t("ugc_script_title")}</Label>
              <Input
                id="script-title"
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="script-hook">{t("ugc_script_hook")}</Label>
              <Textarea
                id="script-hook"
                rows={2}
                value={draft.hook}
                onChange={(event) =>
                  setDraft({ ...draft, hook: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="script-voiceover">
                {t("ugc_script_voiceover")}
              </Label>
              <Textarea
                id="script-voiceover"
                rows={5}
                value={draft.voiceover}
                onChange={(event) =>
                  setDraft({ ...draft, voiceover: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="script-captions">
                {t("ugc_script_captions")}
              </Label>
              <Textarea
                id="script-captions"
                rows={4}
                value={draft.captions}
                onChange={(event) =>
                  setDraft({ ...draft, captions: event.target.value })
                }
                placeholder={t("ugc_brief_one_per_line")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="script-publish">
                {t("ugc_script_publish_caption")}
              </Label>
              <Textarea
                id="script-publish"
                rows={2}
                value={draft.publishCaption}
                onChange={(event) =>
                  setDraft({ ...draft, publishCaption: event.target.value })
                }
              />
            </div>
            <div className="flex items-start gap-3">
              <Switch
                id="script-lock"
                checked={draft.lock}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, lock: checked })
                }
              />
              <div className="space-y-1">
                <Label htmlFor="script-lock">{t("ugc_script_lock")}</Label>
                <p className="text-muted-foreground text-sm">
                  {t("ugc_script_lock_hint")}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("ugc_common_cancel")}
            </Button>
            <Button onClick={submit} disabled={pending}>
              {t("ugc_script_save_revision")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
