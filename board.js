import { supabase } from './supabase.js';

let currentUser = null;
let currentCategory = 'all';

// Check auth state
supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    updateAuthUI();
});

// Initialize
async function init() {
    const session = await supabase.auth.getSession();
    currentUser = session.data.session?.user || null;
    updateAuthUI();
    loadPosts();
    setupEventListeners();
}

function updateAuthUI() {
    const newPostBtn = document.getElementById('new-post-btn');
    if (newPostBtn) {
        newPostBtn.style.display = currentUser ? 'block' : 'none';
    }
}

function setupEventListeners() {
    // Back to map
    document.getElementById('back-to-map').onclick = () => {
        window.location.href = './map.html';
    };

    // New post button
    document.getElementById('new-post-btn').onclick = () => {
        openPostModal();
    };

    // Close modals
    document.getElementById('close-post-modal').onclick = () => {
        closePostModal();
    };

    document.getElementById('close-detail-modal').onclick = () => {
        closeDetailModal();
    };

    document.getElementById('cancel-post-btn').onclick = () => {
        closePostModal();
    };

    // Category tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            loadPosts();
        };
    });

    // Post form submit
    document.getElementById('post-form').onsubmit = async (e) => {
        e.preventDefault();
        await savePost();
    };
}

// Load posts
async function loadPosts() {
    try {
        let query = supabase
            .from('posts')
            .select(`
                *,
                profiles (nickname)
            `)
            .order('created_at', { ascending: false });

        if (currentCategory !== 'all') {
            query = query.eq('category', currentCategory);
        }

        const { data: posts, error } = await query;

        if (error) {
            console.error('Error loading posts:', error);
            showToast('Failed to load posts: ' + error.message);
            return;
        }

        renderPosts(posts || []);
    } catch (err) {
        console.error('Error loading posts:', err);
        showToast('Failed to load posts');
    }
}

// Render posts
function renderPosts(posts) {
    const container = document.getElementById('posts-container');

    if (posts.length === 0) {
        container.innerHTML = '<div class="empty-state">No posts yet. Be the first to share!</div>';
        return;
    }

    const tableHeader = `
        <div class="posts-table-header">
            <div>Category</div>
            <div>Title</div>
            <div>Author</div>
            <div>Date</div>
            <div>Actions</div>
        </div>
    `;

    const postsHTML = posts.map(post => {
        const canDelete = currentUser && post.user_id === currentUser.id;

        return `
        <div class="post-card" onclick="window.viewPost('${post.id}')">
            <div>
                <span class="post-category ${post.category}">${getCategoryLabel(post.category)}</span>
            </div>
            <div class="post-content-area">
                <h3 class="post-title">${escapeHtml(post.title)}</h3>
                <p class="post-preview">${escapeHtml(post.content.substring(0, 80))}${post.content.length > 80 ? '...' : ''}</p>
            </div>
            <div class="post-author">${post.profiles?.nickname || 'User'}</div>
            <div class="post-date">${formatDate(post.created_at)}</div>
            <div class="post-actions">
                ${canDelete ? `<button class="post-delete-btn" onclick="event.stopPropagation(); window.deletePost('${post.id}')" title="Delete">&times;</button>` : ''}
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = tableHeader + postsHTML;
}

// View post detail
window.viewPost = async (postId) => {
    try {
        const { data: post, error } = await supabase
            .from('posts')
            .select(`
                *,
                profiles (nickname)
            `)
            .eq('id', postId)
            .single();

        if (error) throw error;

        const canEdit = currentUser && post.user_id === currentUser.id;

        document.getElementById('post-detail-content').innerHTML = `
            <div class="post-detail-header">
                <span class="post-category ${post.category}">${getCategoryLabel(post.category)}</span>
                <span class="post-date">${formatDate(post.created_at)}</span>
            </div>
            <h2 class="post-detail-title">${escapeHtml(post.title)}</h2>
            <div class="post-detail-author">by ${post.profiles?.nickname || 'User'}</div>
            <div class="post-detail-content">${escapeHtml(post.content).replace(/\n/g, '<br>')}</div>
            ${canEdit ? `
                <div class="post-detail-actions">
                    <button onclick="window.editPost('${post.id}')" class="secondary-btn">Edit</button>
                    <button onclick="window.deletePost('${post.id}')" class="danger-btn">Delete</button>
                </div>
            ` : ''}
        `;

        document.getElementById('detail-modal').classList.remove('hidden');
    } catch (err) {
        console.error('Error loading post:', err);
        showToast('Failed to load post');
    }
};

// Open post modal
function openPostModal(post = null) {
    if (!currentUser) {
        showToast('Please login to create a post');
        return;
    }

    const modal = document.getElementById('post-modal');
    const form = document.getElementById('post-form');

    if (post) {
        document.getElementById('post-modal-title').textContent = 'Edit Post';
        document.getElementById('post-id').value = post.id;
        document.getElementById('post-category').value = post.category;
        document.getElementById('post-title').value = post.title;
        document.getElementById('post-content').value = post.content;
    } else {
        document.getElementById('post-modal-title').textContent = 'New Post';
        form.reset();
        document.getElementById('post-id').value = '';
    }

    modal.classList.remove('hidden');
}

function closePostModal() {
    document.getElementById('post-modal').classList.add('hidden');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.add('hidden');
}

// Save post
async function savePost() {
    const postId = document.getElementById('post-id').value;
    const category = document.getElementById('post-category').value;
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;

    try {
        if (postId) {
            // Update
            const { error } = await supabase
                .from('posts')
                .update({
                    category,
                    title,
                    content,
                    updated_at: new Date().toISOString()
                })
                .eq('id', postId);

            if (error) throw error;
            showToast('Post updated successfully');
        } else {
            // Create
            const { error } = await supabase
                .from('posts')
                .insert({
                    user_id: currentUser.id,
                    category,
                    title,
                    content
                });

            if (error) throw error;
            showToast('Post created successfully');
        }

        closePostModal();
        closeDetailModal();
        loadPosts();
    } catch (err) {
        console.error('Error saving post:', err);
        showToast('Failed to save post');
    }
}

// Edit post
window.editPost = async (postId) => {
    try {
        const { data: post, error } = await supabase
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();

        if (error) throw error;

        closeDetailModal();
        openPostModal(post);
    } catch (err) {
        console.error('Error loading post for edit:', err);
        showToast('Failed to load post');
    }
};

// Delete post
window.deletePost = async (postId) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', postId);

        if (error) throw error;

        showToast('Post deleted successfully');
        closeDetailModal();
        loadPosts();
    } catch (err) {
        console.error('Error deleting post:', err);
        showToast('Failed to delete post');
    }
};

// Helper functions
function getCategoryLabel(category) {
    const labels = {
        review: '리뷰',
        tip: '팁',
        question: '질문'
    };
    return labels[category] || category;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Start
init();
