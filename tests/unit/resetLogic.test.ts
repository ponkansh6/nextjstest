import { describe, it, expect, vi } from "bun:test";
import { createResetHandler, createDualResetHandler } from "../../src/lib/resetLogic";

describe("resetLogic", () => {
  describe("createResetHandler", () => {
    it("should call setter with callback returning empty array when there are hidden keys", () => {
      const setHiddenKeys = vi.fn((callback) => {
        const result = callback(["key1", "key2"]); // current state has hidden keys
        return result;
      });
      const config = {
        hiddenKeys: ["key1", "key2"],
        allKeys: ["key1", "key2", "key3"],
        setHiddenKeys,
      };

      const handler = createResetHandler(config);
      handler();

      expect(setHiddenKeys).toHaveBeenCalledWith(expect.any(Function));
      // Verify the callback returns empty array when given non-empty array
      const callback = setHiddenKeys.mock.calls[0][0];
      expect(callback(["key1", "key2"])).toEqual([]);
    });

    it("should call setter with callback returning all keys when no hidden keys", () => {
      const setHiddenKeys = vi.fn((callback) => {
        const result = callback([]); // current state has no hidden keys
        return result;
      });
      const allKeys = ["key1", "key2", "key3"];
      const config = {
        hiddenKeys: [],
        allKeys,
        setHiddenKeys,
      };

      const handler = createResetHandler(config);
      handler();

      expect(setHiddenKeys).toHaveBeenCalledWith(expect.any(Function));
      // Verify the callback returns allKeys when given empty array
      const callback = setHiddenKeys.mock.calls[0][0];
      expect(callback([])).toEqual(allKeys);
    });

    it("should correctly toggle based on current state", () => {
      const setHiddenKeys = vi.fn((callback) => callback(["key1"]));
      const config = {
        hiddenKeys: ["key1"],
        allKeys: ["key1", "key2", "key3"],
        setHiddenKeys,
      };

      const handler = createResetHandler(config);
      handler();

      const callback = setHiddenKeys.mock.calls[0][0];
      expect(callback(["key1"])).toEqual([]); // has hidden -> show all
      expect(callback([])).toEqual(["key1", "key2", "key3"]); // no hidden -> hide all
    });
  });

  describe("createDualResetHandler", () => {
    it("should toggle each independently based on their own state", () => {
      const setNominal = vi.fn((callback) => callback(["key1"])); // has hidden
      const setReal = vi.fn((callback) => callback([])); // no hidden
      const nominalConfig = {
        hiddenKeys: ["key1"],
        allKeys: ["key1", "key2"],
        setHiddenKeys: vi.fn(),
      };
      const realConfig = {
        hiddenKeys: [],
        allKeys: ["key1", "key2"],
        setHiddenKeys: vi.fn(),
      };

      const handler = createDualResetHandler(nominalConfig, realConfig);
      handler();

      expect(nominalConfig.setHiddenKeys).toHaveBeenCalledWith(expect.any(Function));
      expect(realConfig.setHiddenKeys).toHaveBeenCalledWith(expect.any(Function));

      // Nominal has hidden -> show all (empty)
      // Real has no hidden -> hide all (all keys)
      const nominalCallback = nominalConfig.setHiddenKeys.mock.calls[0][0];
      const realCallback = realConfig.setHiddenKeys.mock.calls[0][0];
      expect(nominalCallback(["key1"])).toEqual([]);
      expect(realCallback([])).toEqual(["key1", "key2"]);
    });

    it("should set both to all keys when neither has hidden keys", () => {
      const allKeys = ["key1", "key2"];
      const setNominal = vi.fn((callback) => callback([]));
      const setReal = vi.fn((callback) => callback([]));
      const nominalConfig = {
        hiddenKeys: [],
        allKeys,
        setHiddenKeys: vi.fn(),
      };
      const realConfig = {
        hiddenKeys: [],
        allKeys,
        setHiddenKeys: vi.fn(),
      };

      const handler = createDualResetHandler(nominalConfig, realConfig);
      handler();

      // Check that setters were called with functions
      expect(nominalConfig.setHiddenKeys).toHaveBeenCalledWith(expect.any(Function));
      expect(realConfig.setHiddenKeys).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should handle both having hidden keys", () => {
      const setNominal = vi.fn((callback) => callback(["key1"]));
      const setReal = vi.fn((callback) => callback(["key2"]));
      const nominalConfig = {
        hiddenKeys: ["key1"],
        allKeys: ["key1", "key2"],
        setHiddenKeys: vi.fn(),
      };
      const realConfig = {
        hiddenKeys: ["key2"],
        allKeys: ["key1", "key2"],
        setHiddenKeys: vi.fn(),
      };

      const handler = createDualResetHandler(nominalConfig, realConfig);
      handler();

      expect(nominalConfig.setHiddenKeys).toHaveBeenCalledWith(expect.any(Function));
      expect(realConfig.setHiddenKeys).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});