import { writable } from 'svelte/store';

export const knowledgeCache = writable<Record<string, any>>({});