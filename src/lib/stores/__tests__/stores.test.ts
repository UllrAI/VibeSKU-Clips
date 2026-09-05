import { describe, it, expect, beforeEach } from "vitest";
import { useProductLibraryStore } from "../product-library-store";
import { useTemplateStore } from "../template-store";
import { useCharacterStore } from "../project-store";
import type { ProductItem } from "../product-library-store";
import type { ScriptTemplate } from "../template-store";
import type { Character } from "../project-store";
import type { Shot } from "@/lib/db/schema";

// ==================== ProductLibrary Store Tests ====================

describe("ProductLibraryStore", () => {
  beforeEach(() => {
    // reset store state before each test
    useProductLibraryStore.setState({ products: [] });
  });

  /** Create product test data */
  function createProduct(overrides?: Partial<ProductItem>): ProductItem {
    return {
      id: "product-1",
      name: "测试商品",
      category: "beauty",
      description: "这是一个测试商品",
      images: ["https://example.com/img.jpg"],
      price: "99.9元",
      targetAudience: "年轻女性",
      videoCount: 0,
      createdAt: new Date("2026-01-01"),
      ...overrides,
    };
  }

  it("添加商品", () => {
    const product = createProduct();
    useProductLibraryStore.getState().addProduct(product);

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("测试商品");
    expect(products[0].category).toBe("beauty");
    expect(products[0].videoCount).toBe(0);
  });

  it("添加多个商品", () => {
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p1", name: "商品A" }));
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p2", name: "商品B" }));

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(2);
    expect(products[0].name).toBe("商品A");
    expect(products[1].name).toBe("商品B");
  });

  it("更新商品", () => {
    const product = createProduct();
    useProductLibraryStore.getState().addProduct(product);
    useProductLibraryStore.getState().updateProduct("product-1", {
      name: "更新后的商品",
      price: "199元",
    });

    const { products } = useProductLibraryStore.getState();
    expect(products[0].name).toBe("更新后的商品");
    expect(products[0].price).toBe("199元");
    // other fields remain unchanged
    expect(products[0].category).toBe("beauty");
  });

  it("更新不存在的商品不应报错且不改变数据", () => {
    const product = createProduct();
    useProductLibraryStore.getState().addProduct(product);
    useProductLibraryStore.getState().updateProduct("non-existent-id", {
      name: "不应生效",
    });

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("测试商品");
  });

  it("删除商品", () => {
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p1" }));
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p2" }));
    useProductLibraryStore.getState().removeProduct("p1");

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe("p2");
  });

  it("删除不存在的商品不应报错", () => {
    useProductLibraryStore.getState().addProduct(createProduct());
    // deleting a non-existent id should not throw
    expect(() => {
      useProductLibraryStore.getState().removeProduct("non-existent-id");
    }).not.toThrow();

    const { products } = useProductLibraryStore.getState();
    expect(products).toHaveLength(1);
  });

  it("递增视频计数", () => {
    useProductLibraryStore.getState().addProduct(createProduct({ id: "p1", videoCount: 0 }));
    useProductLibraryStore.getState().incrementVideoCount("p1");
    useProductLibraryStore.getState().incrementVideoCount("p1");

    const { products } = useProductLibraryStore.getState();
    expect(products[0].videoCount).toBe(2);
  });

  it("递增不存在的商品的视频计数不应报错", () => {
    useProductLibraryStore.getState().addProduct(createProduct());
    expect(() => {
      useProductLibraryStore.getState().incrementVideoCount("non-existent-id");
    }).not.toThrow();

    // existing data must not be affected
    const { products } = useProductLibraryStore.getState();
    expect(products[0].videoCount).toBe(0);
  });

  it("createdAt 应为 Date 类型", () => {
    const product = createProduct({ createdAt: new Date("2026-03-01T10:00:00Z") });
    useProductLibraryStore.getState().addProduct(product);

    const { products } = useProductLibraryStore.getState();
    expect(products[0].createdAt).toBeInstanceOf(Date);
    expect(products[0].createdAt.toISOString()).toBe("2026-03-01T10:00:00.000Z");
  });
});

// ==================== Template Store Tests ====================

describe("TemplateStore", () => {
  beforeEach(() => {
    useTemplateStore.setState({ templates: [] });
  });

  /** Create template test data */
  function createTemplate(overrides?: Partial<ScriptTemplate>): ScriptTemplate {
    const defaultShot: Shot = {
      shotId: 1,
      type: "hook",
      duration: 3,
      description: "吸引注意力的开场",
      camera: "zoom_in",
      visualSource: "ai_generate",
      transition: "ai_start_end",
      voiceover: "你是否遇到过这样的问题？",
    };
    return {
      id: "template-1",
      name: "测试模板",
      description: "痛点式脚本模板",
      category: "beauty",
      videoMode: "product_closeup",
      styleType: "pain_point",
      shots: [defaultShot],
      totalDuration: 30,
      sourceProjectId: "project-1",
      useCount: 0,
      createdAt: new Date("2026-01-01"),
      ...overrides,
    };
  }

  it("添加模板", () => {
    const template = createTemplate();
    useTemplateStore.getState().addTemplate(template);

    const { templates } = useTemplateStore.getState();
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("测试模板");
    expect(templates[0].shots).toHaveLength(1);
    expect(templates[0].useCount).toBe(0);
  });

  it("删除模板", () => {
    useTemplateStore.getState().addTemplate(createTemplate({ id: "t1" }));
    useTemplateStore.getState().addTemplate(createTemplate({ id: "t2" }));
    useTemplateStore.getState().removeTemplate("t1");

    const { templates } = useTemplateStore.getState();
    expect(templates).toHaveLength(1);
    expect(templates[0].id).toBe("t2");
  });

  it("删除不存在的模板不应报错", () => {
    useTemplateStore.getState().addTemplate(createTemplate());
    expect(() => {
      useTemplateStore.getState().removeTemplate("non-existent-id");
    }).not.toThrow();

    const { templates } = useTemplateStore.getState();
    expect(templates).toHaveLength(1);
  });

  it("递增使用次数", () => {
    useTemplateStore.getState().addTemplate(createTemplate({ id: "t1", useCount: 0 }));
    useTemplateStore.getState().incrementUseCount("t1");
    useTemplateStore.getState().incrementUseCount("t1");
    useTemplateStore.getState().incrementUseCount("t1");

    const { templates } = useTemplateStore.getState();
    expect(templates[0].useCount).toBe(3);
  });

  it("递增不存在模板的使用次数不应报错", () => {
    useTemplateStore.getState().addTemplate(createTemplate());
    expect(() => {
      useTemplateStore.getState().incrementUseCount("non-existent-id");
    }).not.toThrow();

    const { templates } = useTemplateStore.getState();
    expect(templates[0].useCount).toBe(0);
  });

  it("createdAt 应为 Date 类型", () => {
    const template = createTemplate({ createdAt: new Date("2026-06-15T08:00:00Z") });
    useTemplateStore.getState().addTemplate(template);

    const { templates } = useTemplateStore.getState();
    expect(templates[0].createdAt).toBeInstanceOf(Date);
  });
});

// ==================== Character Store Tests ====================

describe("CharacterStore", () => {
  beforeEach(() => {
    useCharacterStore.setState({ characters: [] });
  });

  /** Create character test data */
  function createCharacter(overrides?: Partial<Character>): Character {
    return {
      id: "char-1",
      name: "小美",
      description: "25岁女生，活泼开朗",
      appearance: "young woman with long black hair",
      referenceImages: ["https://example.com/ref1.jpg"],
      voiceProfile: { style: "温柔女声", speed: 1.0, emotion: "happy" },
      isDefault: false,
      ...overrides,
    };
  }

  it("添加人物", () => {
    const char = createCharacter();
    useCharacterStore.getState().addCharacter(char);

    const { characters } = useCharacterStore.getState();
    expect(characters).toHaveLength(1);
    expect(characters[0].name).toBe("小美");
    expect(characters[0].referenceImages).toHaveLength(1);
  });

  it("添加多个人物", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1", name: "小美" }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c2", name: "小强" }));

    const { characters } = useCharacterStore.getState();
    expect(characters).toHaveLength(2);
  });

  it("更新人物", () => {
    useCharacterStore.getState().addCharacter(createCharacter());
    useCharacterStore.getState().updateCharacter("char-1", {
      name: "小美（更新）",
      appearance: "young woman with short hair",
    });

    const { characters } = useCharacterStore.getState();
    expect(characters[0].name).toBe("小美（更新）");
    expect(characters[0].appearance).toBe("young woman with short hair");
    // fields not updated must remain unchanged
    expect(characters[0].description).toBe("25岁女生，活泼开朗");
  });

  it("更新不存在的人物不应报错", () => {
    useCharacterStore.getState().addCharacter(createCharacter());
    expect(() => {
      useCharacterStore.getState().updateCharacter("non-existent-id", { name: "不存在" });
    }).not.toThrow();

    const { characters } = useCharacterStore.getState();
    expect(characters[0].name).toBe("小美");
  });

  it("删除人物", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1" }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c2" }));
    useCharacterStore.getState().removeCharacter("c1");

    const { characters } = useCharacterStore.getState();
    expect(characters).toHaveLength(1);
    expect(characters[0].id).toBe("c2");
  });

  it("删除不存在的人物不应报错", () => {
    useCharacterStore.getState().addCharacter(createCharacter());
    expect(() => {
      useCharacterStore.getState().removeCharacter("non-existent-id");
    }).not.toThrow();

    const { characters } = useCharacterStore.getState();
    expect(characters).toHaveLength(1);
  });

  it("获取默认人物", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1", isDefault: false }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c2", isDefault: true }));

    const defaultChar = useCharacterStore.getState().getDefault();
    expect(defaultChar).toBeDefined();
    expect(defaultChar!.id).toBe("c2");
  });

  it("没有默认人物时返回 undefined", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ isDefault: false }));

    const defaultChar = useCharacterStore.getState().getDefault();
    expect(defaultChar).toBeUndefined();
  });

  it("设为默认（取消其他默认）", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1", isDefault: true }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c2", isDefault: false }));
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c3", isDefault: false }));

    // set c2 as the default
    useCharacterStore.getState().setDefault("c2");

    const { characters } = useCharacterStore.getState();
    expect(characters.find((c) => c.id === "c1")!.isDefault).toBe(false);
    expect(characters.find((c) => c.id === "c2")!.isDefault).toBe(true);
    expect(characters.find((c) => c.id === "c3")!.isDefault).toBe(false);

    // getDefault should also return c2
    const defaultChar = useCharacterStore.getState().getDefault();
    expect(defaultChar!.id).toBe("c2");
  });

  it("设为默认：对不存在的 id 调用不应报错", () => {
    useCharacterStore.getState().addCharacter(createCharacter({ id: "c1", isDefault: true }));

    expect(() => {
      useCharacterStore.getState().setDefault("non-existent-id");
    }).not.toThrow();

    // all characters will have isDefault set to false (since no id matches)
    const { characters } = useCharacterStore.getState();
    expect(characters[0].isDefault).toBe(false);
  });
});
