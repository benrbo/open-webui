<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import Search from '../icons/Search.svelte';
	import XMark from '../icons/XMark.svelte';
	import EllipsisHorizontal from '../icons/EllipsisHorizontal.svelte';
	import { chats, chatTitle as _chatTitle, tags } from '$lib/stores';
	import { getChatById, getChatList } from '$lib/apis/chats';

	const i18n = getContext('i18n');

	let loaded = false;
	let query = '';
	let sortOption = '';
	let dateFilter = '';
	let list: any[] = [];
	let filteredItems: any[] = [];

	const displayModels = (chat) => {
		const models = chat.chat?.models;
		if (!models || models.length === 0) return '—';
		return models.join(', ');
	};

	const getTimeRange = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);

		if (
			date.getFullYear() === today.getFullYear() &&
			date.getMonth() === today.getMonth() &&
			date.getDate() === today.getDate()
		) {
			return 'Today';
		}
		if (
			date.getFullYear() === yesterday.getFullYear() &&
			date.getMonth() === yesterday.getMonth() &&
			date.getDate() === yesterday.getDate()
		) {
			return 'Yesterday';
		}
		return date.toLocaleDateString();
	};

	const filterItems = () => {
		if (!list.length) {
			filteredItems = [];
			return;
		}

		const q = query.toLowerCase();

		filteredItems = list
			.filter((chat) => {
				const modelsStr = chat.chat?.models?.join(', ') || '';
				const matchesQuery =
					chat.title?.toLowerCase().includes(q) ||
					modelsStr.toLowerCase().includes(q) ||
					(chat.tag || '').toLowerCase().includes(q);

				const matchesDate = dateFilter ? chat.time_range === dateFilter : true;
				return matchesQuery && matchesDate;
			})
			.sort((a, b) => {
				if (sortOption === 'date') return (b.created_at || 0) - (a.created_at || 0);
				if (sortOption === 'model') {
					const aModel = (a.chat?.models?.[0] || '').toLowerCase();
					const bModel = (b.chat?.models?.[0] || '').toLowerCase();
					return aModel.localeCompare(bModel);
				}
				if (sortOption === 'tag') return (a.tag || '').localeCompare(b.tag || '');
				return 0;
			});
	};

	$: query, sortOption, dateFilter, filterItems();

	const saveTitle = (chat, e) => {
		const newTitle = e.target.value.trim();
		if (!newTitle || newTitle === chat.title) return;

		list = list.map((c) => (c.id === chat.id ? { ...c, title: newTitle } : c));
		chats.set(list);
		_chatTitle.set(newTitle);
		toast.success($i18n.t('Chat title updated'));
		filterItems();
	};

	const saveTag = (chat, e) => {
		const newTag = e.target.value.trim();
		list = list.map((c) => (c.id === chat.id ? { ...c, tag: newTag } : c));
		chats.set(list);
		tags.update((t) => ({ ...t, [chat.id]: newTag }));
		toast.success($i18n.t('Tag updated'));
		filterItems();
	};

	onMount(async () => {
		loaded = false;
		try {
			const chatList = await getChatList(localStorage.token);

			list = await Promise.all(
				chatList.map(async (chat) => {
					const fullChat = await getChatById(localStorage.token, chat.id);
					fullChat.time_range = getTimeRange(fullChat.created_at);
					return fullChat;
				})
			);

			chats.set(list);
			filterItems();
		} catch (err) {
			console.error('Error loading chats:', err);
		} finally {
			loaded = true;
		}
	});
</script>

<svelte:head>
	<title>{$i18n.t('Chats Management')}</title>
</svelte:head>

{#if loaded}
	<div class="flex flex-col gap-1 px-1 mt-1.5 mb-3">
		<div class="flex justify-between items-center">
			<div class="flex items-center text-xl font-medium gap-2">
				{$i18n.t('Chats')}
				<div class="text-lg font-medium text-gray-500 dark:text-gray-500">
					{filteredItems.length}
				</div>
			</div>
		</div>
	</div>

	<div
		class="py-2 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100/30 dark:border-gray-850/30"
	>
		<div class="flex w-full space-x-2 py-0.5 px-3.5 pb-2">
			<div class="flex flex-1">
				<div class="self-center ml-1 mr-3">
					<Search className="size-3.5" />
				</div>

				<input
					class="w-full text-sm pr-4 py-1 bg-transparent"
					bind:value={query}
					placeholder={$i18n.t('Search chats')}
				/>

				{#if query}
					<button
						class="p-1 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-full"
						on:click={() => (query = '')}
					>
						<XMark className="size-3" />
					</button>
				{/if}
			</div>
		</div>

		<div class="flex gap-2 px-3 mb-2">
			<select
				class="text-sm bg-gray-50 dark:bg-gray-850 rounded-xl px-2 py-1"
				bind:value={sortOption}
			>
				<option value="">{$i18n.t('Sort')}</option>
				<option value="date">{$i18n.t('Date')}</option>
				<option value="model">{$i18n.t('Model')}</option>
				<option value="tag">{$i18n.t('Tag')}</option>
			</select>

			<select
				class="text-sm bg-gray-50 dark:bg-gray-850 rounded-xl px-2 py-1"
				bind:value={dateFilter}
			>
				<option value="">{$i18n.t('All Dates')}</option>
				<option value="Today">{$i18n.t('Today')}</option>
				<option value="Yesterday">{$i18n.t('Yesterday')}</option>
				<option value="Last 7 Days">{$i18n.t('Last 7 Days')}</option>
			</select>
		</div>

		{#if filteredItems.length}
			<div class="my-2 gap-2 grid px-3 lg:grid-cols-2">
				{#each filteredItems as chat}
					<div
						class="flex space-x-4 cursor-pointer px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-850 rounded-2xl"
					>
						<div class="flex flex-1" on:click={() => goto(`/c/${chat.id}`)}>
							<div class="flex flex-col">
								<input
									class="text-sm font-medium bg-transparent border-none outline-none"
									value={chat.title}
									on:blur={(e) => saveTitle(chat, e)}
									on:click={(e) => e.stopPropagation()}
								/>
								<div class="text-xs text-gray-500">
									{displayModels(chat)}
									<span class="ml-1 text-gray-400">({chat.time_range})</span>
								</div>
							</div>
						</div>

						<div class="flex flex-col w-24">
							<input
								class="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded"
								value={chat.tag}
								placeholder={$i18n.t('Tag')}
								on:blur={(e) => saveTag(chat, e)}
							/>
						</div>

						<div class="self-center">
							<EllipsisHorizontal className="size-5" />
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="text-center py-10 text-gray-500">{$i18n.t('No chats found')}</div>
		{/if}
	</div>
{:else}
	<div class="flex justify-center items-center py-20">Loading...</div>
{/if}
