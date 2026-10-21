import { describe, expect, it } from "vitest";
import { addChapter, chapterRows, decodeChapters, encodeChapters, sceneTitle, studioFileName } from "@/lib/studio";

describe("studio chapters", () => {
  it("adds marks and merges ones made in quick succession", () => {
    let c = addChapter([], 0, "Whiteboard");
    c = addChapter(c, 1.4, "Screen share");
    expect(c).toEqual([{ t: 0, title: "Screen share" }]);
    c = addChapter(c, 30.9, "Whiteboard 2");
    c = addChapter(c, 32, "Camera");
    expect(c).toEqual([{ t: 0, title: "Screen share" }, { t: 32, title: "Camera" }]);
    expect(addChapter(c, 33, "Camera")).toBe(c);
    expect(addChapter([], 5, "  ")[0].title).toBe("Chapter");
  });

  it("round-trips through the address and tidies what comes back", () => {
    const list = [{ t: 0, title: "Whiteboard" }, { t: 75, title: "Screen share" }];
    expect(decodeChapters(encodeChapters(list), 120)).toEqual(list);
    expect(decodeChapters('[[40,"B"],[10,"A"],[10,"dup"],[500,"late"],["x","bad"],[5,""]]', 120))
      .toEqual([{ t: 0, title: "Introduction" }, { t: 10, title: "A" }, { t: 40, title: "B" }]);
    expect(decodeChapters("not json", null)).toEqual([{ t: 0, title: "Introduction" }]);
    expect(decodeChapters(undefined, 60)).toEqual([{ t: 0, title: "Introduction" }]);
    expect(chapterRows(list)).toEqual([{ time: "0:00", title: "Whiteboard" }, { time: "1:15", title: "Screen share" }]);
  });

  it("names views and files", () => {
    expect(sceneTitle("board", 0)).toBe("Whiteboard");
    expect(sceneTitle("board", 2)).toBe("Whiteboard 3");
    expect(sceneTitle("screen", 0)).toBe("Screen share");
    const name = studioFileName("Fractions: part 2!", new Date("2026-10-21T09:05:00Z"));
    expect(name).toBe("studio-Fractions-part-2-2026-10-21-09-05.webm");
    expect(/^recordings\/[\w .()-]{1,120}\.(mp4|webm|mov)$/i.test(`recordings/${name}`)).toBe(true);
  });
});
