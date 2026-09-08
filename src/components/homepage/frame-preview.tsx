"use client";

import { useState } from "react";
import Image from "next/image";
import { RectangleHorizontal, RectangleVertical } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function FramePreview({
  labels,
}: {
  labels: {
    title: string;
    portrait: string;
    landscape: string;
    alt: string;
    note: string;
    caption: string;
  };
}) {
  const [format, setFormat] = useState("portrait");
  return (
    <Tabs value={format} onValueChange={setFormat} className="min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{labels.title}</p>
        <TabsList className="h-auto! rounded-md" aria-label={labels.title}>
          <TabsTrigger
            value="portrait"
            className="data-[state=active]:text-primary min-h-11 gap-2 rounded-md px-3"
          >
            <RectangleVertical aria-hidden />
            {labels.portrait}
          </TabsTrigger>
          <TabsTrigger
            value="landscape"
            className="data-[state=active]:text-primary min-h-11 gap-2 rounded-md px-3"
          >
            <RectangleHorizontal aria-hidden />
            {labels.landscape}
          </TabsTrigger>
        </TabsList>
      </div>
      {(["portrait", "landscape"] as const).map((value) => (
        <TabsContent
          key={value}
          value={value}
          className="bg-muted flex h-[410px] items-center justify-center overflow-hidden rounded-lg border p-5 sm:h-[480px] sm:p-8"
        >
          <figure
            className={
              value === "portrait"
                ? "relative aspect-[9/16] h-full overflow-hidden rounded-md"
                : "relative aspect-video w-full overflow-hidden rounded-md"
            }
          >
            <Image
              src="/images/home/creator-tumbler.webp"
              fill
              sizes="(min-width: 1024px) 560px, 90vw"
              alt={labels.alt}
              className="object-cover object-[center_35%]"
            />
          </figure>
        </TabsContent>
      ))}
      <div className="flex items-start justify-between gap-4 text-xs leading-5">
        <p className="text-muted-foreground">{labels.note}</p>
        <span className="shrink-0 font-mono" translate="no">
          {format === "portrait" ? "9:16" : "16:9"} / 15s
        </span>
      </div>
      <p className="text-muted-foreground text-sm leading-6">
        {labels.caption}
      </p>
    </Tabs>
  );
}
