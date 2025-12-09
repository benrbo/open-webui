<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import Fuse from 'fuse.js';
	import { toast } from 'svelte-sonner';
	import { v4 as uuidv4 } from 'uuid';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { knowledgeCache } from '$lib/stores/knowledgeCache';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Files from './KnowledgeBase/Files.svelte';
	import AddTextContentModal from './KnowledgeBase/AddTextContentModal.svelte';
	import SyncConfirmDialog from '../../common/ConfirmDialog.svelte';
	import AccessControlModal from '../common/AccessControlModal.svelte';
	import { uploadFile, getFileById, updateFileDataContentById } from '$lib/apis/files';
	import {
		getKnowledgeById,
		addFileToKnowledgeById,
		removeFileFromKnowledgeById,
		updateFileFromKnowledgeById,
		updateKnowledgeById
	} from '$lib/apis/knowledge';
	import { blobToFile } from '$lib/utils';

	const i18n = getContext('i18n');

	let id;
	let knowledge = null;
	let query = '';
	let fuse = null;
	let filteredItems = [];
	let selectedFile = null;
	let selectedFileContent = '';
	let fileContentCache = new Map();
	let debounceTimeout;
	let showAddTextContentModal = false;
	let showSyncConfirmModal = false;
	let showAccessControlModal = false;
	let isSaving = false;

	async function loadKnowledge() {
		let cachedKnowledge;
		knowledgeCache.subscribe((cache) => (cachedKnowledge = cache[id]))();

		if (cachedKnowledge) {
			console.log('Loaded from cache:', id);
			knowledge = cachedKnowledge;
		} else {
			console.log('Fetching from API:', id);
			const res = await getKnowledgeById(localStorage.token, id).catch((e) => {
				toast.error(`${e}`);
				return null;
			});
			if (res) {
				knowledge = res;
				knowledgeCache.update((cache) => {
					cache[id] = res;
					return cache;
				});
			} else {
				goto('/workspace/knowledge');
			}
		}
		updateFuse();
	}

	function updateFuse() {
		if (!knowledge || !knowledge.files) return;
		fuse = new Fuse(knowledge.files, { keys: ['meta.name', 'meta.description'] });
		updateFilteredItems();
	}

	function updateFilteredItems() {
		filteredItems = query ? fuse.search(query).map((r) => r.item) : (knowledge.files ?? []);
		console.log('Filtered items count:', filteredItems.length);
	}

	async function fileSelectHandler(file) {
		selectedFile = file;
		if (fileContentCache.has(file.id)) {
			selectedFileContent = fileContentCache.get(file.id);
		} else {
			const res = await getFileById(localStorage.token, file.id).catch(() => null);
			if (res) {
				selectedFileContent = res.data.content;
				fileContentCache.set(file.id, res.data.content);
			} else {
				toast.error($i18n.t('No content found in file.'));
			}
		}
	}

	async function updateFileContentHandler() {
		if (isSaving || !selectedFile) return;
		isSaving = true;
		try {
			fileContentCache.delete(selectedFile.id);
			await updateFileDataContentById(localStorage.token, selectedFile.id, selectedFileContent);
			const updatedKnowledge = await updateFileFromKnowledgeById(
				localStorage.token,
				id,
				selectedFile.id
			);
			if (updatedKnowledge) {
				knowledge = updatedKnowledge;
				knowledgeCache.update((cache) => {
					cache[id] = updatedKnowledge;
					return cache;
				});
				updateFuse();
				toast.success($i18n.t('File content updated successfully.'));
			}
		} finally {
			isSaving = false;
		}
	}

	async function uploadFileHandler(file) {
		const tempId = uuidv4();
		const fileItem = { id: null, name: file.name, status: 'uploading', itemId: tempId };
		knowledge.files = [...(knowledge.files ?? []), fileItem];
		updateFuse();

		const uploadedFile = await uploadFile(localStorage.token, file).catch((e) => {
			toast.error(`${e}`);
			return null;
		});
		if (uploadedFile) {
			knowledge.files = knowledge.files.map((f) =>
				f.itemId === tempId ? { ...f, id: uploadedFile.id, itemId: undefined } : f
			);
			await addFileToKnowledgeById(localStorage.token, id, uploadedFile.id);
			knowledgeCache.update((cache) => {
				cache[id] = knowledge;
				return cache;
			});
			updateFuse();
			toast.success($i18n.t('File uploaded successfully.'));
		} else {
			knowledge.files = knowledge.files.filter((f) => f.itemId !== tempId);
			updateFuse();
		}
	}

	async function deleteFileHandler(fileId) {
		await removeFileFromKnowledgeById(localStorage.token, id, fileId).catch((e) =>
			toast.error(`${e}`)
		);
		knowledge.files = knowledge.files.filter((f) => f.id !== fileId);
		knowledgeCache.update((cache) => {
			cache[id] = knowledge;
			return cache;
		});
		updateFuse();
	}

	function debounceUpdateKnowledge() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(async () => {
			const res = await updateKnowledgeById(localStorage.token, id, knowledge).catch((e) =>
				toast.error(`${e}`)
			);
			if (res) {
				knowledge = res;
				knowledgeCache.update((cache) => {
					cache[id] = res;
					return cache;
				});
				toast.success($i18n.t('Knowledge updated successfully'));
			}
		}, 1000);
	}

	onMount(() => {
		id = $page.params.id;
		loadKnowledge();
	});
</script>

<div class="flex flex-col w-full h-full">
	{#if knowledge}
		<!-- Header -->
		<input
			type="text"
			bind:value={knowledge.name}
			placeholder={$i18n.t('Knowledge Name')}
			on:input={debounceUpdateKnowledge}
			class="text-2xl w-full mb-1"
		/>
		<input
			type="text"
			bind:value={knowledge.description}
			placeholder={$i18n.t('Knowledge Description')}
			on:input={debounceUpdateKnowledge}
			class="text-sm w-full mb-3"
		/>

		<input
			type="text"
			bind:value={query}
			placeholder={$i18n.t('Search Collection')}
			on:input={updateFilteredItems}
			class="w-full p-2 mb-2 border rounded"
		/>

		<Files
			files={filteredItems}
			on:click={(e) => fileSelectHandler(e.detail)}
			on:delete={(e) => deleteFileHandler(e.detail)}
		/>

		{#if selectedFile}
			<textarea
				bind:value={selectedFileContent}
				placeholder={$i18n.t('Add content here')}
				class="w-full h-64 my-2 p-2 border rounded"
			></textarea>
			<button on:click={updateFileContentHandler} disabled={isSaving}>{$i18n.t('Save')}</button>
		{/if}

		<AddTextContentModal
			bind:show={showAddTextContentModal}
			on:submit={(e) => uploadFileHandler(blobToFile(new Blob([e.detail.content]), e.detail.name))}
		/>
		<SyncConfirmDialog
			bind:show={showSyncConfirmModal}
			message={$i18n.t(
				'This will reset the knowledge base and sync all files. Do you wish to continue?'
			)}
		/>
		<AccessControlModal
			bind:show={showAccessControlModal}
			bind:accessControl={knowledge.access_control}
		/>
	{:else}
		<Spinner />
	{/if}
</div>
