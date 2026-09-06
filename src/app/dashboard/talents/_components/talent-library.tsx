"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Archive, Plus } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "@/components/ugc/image-field";
import { actionMessageKey } from "@/components/ugc/action-message";
import { useTranslation } from "@/lib/i18n/translation/client";
import { archiveTalent, createTalent } from "@/lib/ugc/actions";
import type { TalentRow } from "@/lib/ugc/queries";

export function TalentLibrary({ talents }: { talents: TalentRow[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"uploaded" | "generated">("uploaded");
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [licenceNote, setLicenceNote] = useState("");
  const [voicePreset, setVoicePreset] = useState("");

  const reset = () => {
    setName("");
    setImages([]);
    setPrompt("");
    setLicenceNote("");
    setVoicePreset("");
  };

  const submit = () =>
    startTransition(async () => {
      const result = await createTalent({
        name: name.trim(),
        source,
        imageUrl: images[0],
        prompt: prompt.trim() || undefined,
        licenceNote: licenceNote.trim() || undefined,
        voicePreset: voicePreset.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(t(actionMessageKey(result.code)));
        return;
      }
      toast.success(t("ugc_talent_created"));
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
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">{t("ugc_talent_empty_title")}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("ugc_talent_empty_hint")}
            </p>
          </CardContent>
        </Card>
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
                      <p className="text-muted-foreground p-4 text-sm">
                        {t("ugc_talent_generated_on_first_use")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{talent.name}</span>
                    <Badge variant="outline">
                      {t(
                        talent.source === "uploaded"
                          ? "ugc_talent_source_uploaded"
                          : "ugc_talent_source_generated",
                      )}
                    </Badge>
                  </div>
                  {talent.prompt && (
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {talent.prompt}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {talent.licenceNote || t("ugc_talent_no_licence_note")}
                  </p>
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

            <Tabs
              value={source}
              onValueChange={(value) =>
                setSource(value as "uploaded" | "generated")
              }
            >
              <TabsList>
                <TabsTrigger value="uploaded">
                  {t("ugc_talent_source_uploaded")}
                </TabsTrigger>
                <TabsTrigger value="generated">
                  {t("ugc_talent_source_generated")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="uploaded" className="space-y-2 pt-4">
                <ImageField
                  value={images}
                  onChange={setImages}
                  maxFiles={1}
                  label={t("ugc_talent_reference_image")}
                />
              </TabsContent>
              <TabsContent value="generated" className="space-y-2 pt-4">
                <Label htmlFor="talent-prompt">
                  {t("ugc_talent_appearance")}
                </Label>
                <Textarea
                  id="talent-prompt"
                  rows={4}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t("ugc_talent_appearance_placeholder")}
                />
                <p className="text-muted-foreground text-xs">
                  {t("ugc_talent_generated_hint")}
                </p>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label htmlFor="talent-voice">{t("ugc_talent_voice")}</Label>
              <Input
                id="talent-voice"
                value={voicePreset}
                onChange={(event) => setVoicePreset(event.target.value)}
                placeholder={t("ugc_talent_voice_placeholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="talent-licence">{t("ugc_talent_licence")}</Label>
              <Textarea
                id="talent-licence"
                rows={3}
                value={licenceNote}
                onChange={(event) => setLicenceNote(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {t("ugc_talent_licence_hint")}
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
            <Button onClick={submit} disabled={pending || !name.trim()}>
              {t("ugc_common_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
