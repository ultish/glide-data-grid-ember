// A deliberately minimal "model store" for the tracking-proof demo
// (`app/components/tracking-demo.gts`).
//
// This exists to model the shape a real app actually has: a normalized cache holding long-lived
// *object references*, where each object carries `@tracked` properties that are mutated in place.
// That is the Apollo-cache / MobX-ish pattern -- NOT ember-data, and deliberately not the
// "rebuild an immutable snapshot on every change" pattern the main `<DemoGrid>` demo uses.
//
// The point of the distinction: here the array identity and every object identity stay stable
// forever. The *only* thing that ever changes is a `@tracked` field on an object that the grid is
// already displaying. If the grid repaints under those conditions, autotracking is genuinely
// driving the canvas -- there is no identity change anywhere for it to have keyed off instead.
//
// (The blueprint-generated `app/services/store.ts` is WarpDrive/ember-data and is unused by this
// demo -- left in place untouched so the scaffold stays intact.)
import { tracked } from "@glimmer/tracking";

export type Role = "Engineer" | "Designer" | "PM" | "Support";

export const ROLES: readonly Role[] = ["Engineer", "Designer", "PM", "Support"];

/**
 * One model object. Every displayed field is `@tracked`, so mutating it in place invalidates any
 * autotracking computation that read it -- which is exactly what the grid demo relies on.
 *
 * `id` is intentionally NOT tracked: it is the stable identity of the record and never changes.
 */
export class Person {
    readonly id: number;

    @tracked name: string;
    @tracked email: string;
    @tracked role: Role;
    @tracked age: number;
    @tracked active: boolean;

    constructor(id: number, name: string, email: string, role: Role, age: number, active: boolean) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.role = role;
        this.age = age;
        this.active = active;
    }
}

const SEED: readonly (readonly [string, string, Role, number, boolean])[] = [
    ["Ada Lovelace", "ada@example.com", "Engineer", 36, true],
    ["Grace Hopper", "grace@example.com", "Engineer", 45, true],
    ["Alan Turing", "alan@example.com", "Engineer", 41, false],
    ["Katherine Johnson", "katherine@example.com", "PM", 52, true],
    ["Margaret Hamilton", "margaret@example.com", "Engineer", 33, true],
    ["Radia Perlman", "radia@example.com", "Designer", 39, false],
    ["Barbara Liskov", "barbara@example.com", "PM", 47, true],
    ["Jean Bartik", "jean@example.com", "Support", 29, true],
];

/**
 * The store. Holds object references and hands the same instances out on every read -- there is no
 * serialization/deserialization step and no copying, so `store.all[0]` is `===` the same `Person`
 * for the lifetime of the store.
 */
export class ModelStore {
    readonly all: readonly Person[];

    constructor() {
        this.all = SEED.map(([name, email, role, age, active], i) => new Person(i + 1, name, email, role, age, active));
    }

    find(id: number): Person | undefined {
        return this.all.find(p => p.id === id);
    }
}
