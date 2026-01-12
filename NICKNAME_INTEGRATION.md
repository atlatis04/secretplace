# Nickname Settings Integration Code

## Instructions
Add this code to your settings modal in `map.html` to enable nickname display and changing.

### 1. Add Nickname Section to Settings Modal (map.html)

Find the settings modal (around line 238-276) and add this section after the Language setting:

```html
<div class="setting-group" style="margin-bottom: 24px;">
  <label style="display: block; margin-bottom: 8px; font-weight: 600; color: rgba(255, 255, 255, 0.9); font-size: 15px;">Nickname</label>
  <div style="display: flex; gap: 8px; align-items: center;">
    <input type="text" id="current-nickname" readonly
      style="flex: 1; padding: 12px; border-radius: 8px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.3); color: white; font-size: 15px; cursor: not-allowed;"
      value="Loading...">
    <button id="change-nickname-btn" class="primary-btn"
      style="padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; white-space: nowrap;">Change</button>
  </div>
</div>
```

### 2. Add Nickname Change Modal (map.html)

Add this modal before the closing `</div>` of the app div (around line 329):

```html
<!-- Nickname Change Modal -->
<div id="nickname-change-modal" class="modal-overlay hidden" style="z-index: 4000;">
  <div class="modal">
    <div class="modal-header">
      <h2>Change Nickname</h2>
      <button id="close-nickname-change" class="close-btn">&times;</button>
    </div>
    <form id="nickname-change-form">
      <div class="form-group">
        <label for="new-nickname">New Nickname</label>
        <input type="text" id="new-nickname" required placeholder="Enter new nickname" maxlength="30">
        <p style="font-size: 12px; color: var(--text-gray); margin-top: 4px;">Letters, numbers, spaces, hyphens, and underscores only (max 30 characters)</p>
      </div>
      <div class="modal-footer">
        <button type="submit" id="submit-nickname-change" class="primary-btn">Change</button>
        <button type="button" id="cancel-nickname-change" class="danger-btn"
          style="background: #334155; color: white;">Cancel</button>
      </div>
    </form>
  </div>
</div>
```

### 3. Add JavaScript to main.js

Add these imports at the top of `main.js`:

```javascript
import { getUserProfile, updateNickname } from './profile-manager.js';
```

Add this code to handle nickname functionality (add near other event listeners):

```javascript
// Nickname functionality
let currentUserProfile = null;

// Load user profile when settings modal opens
document.getElementById('settings-btn')?.addEventListener('click', async () => {
    if (currentUser) {
        currentUserProfile = await getUserProfile(currentUser.id);
        if (currentUserProfile) {
            document.getElementById('current-nickname').value = currentUserProfile.nickname;
        }
    }
});

// Open nickname change modal
document.getElementById('change-nickname-btn')?.addEventListener('click', () => {
    document.getElementById('nickname-change-modal').classList.remove('hidden');
    document.getElementById('new-nickname').value = '';
});

// Close nickname change modal
document.getElementById('close-nickname-change')?.addEventListener('click', () => {
    document.getElementById('nickname-change-modal').classList.add('hidden');
});

document.getElementById('cancel-nickname-change')?.addEventListener('click', () => {
    document.getElementById('nickname-change-modal').classList.add('hidden');
});

// Handle nickname change
document.getElementById('nickname-change-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newNickname = document.getElementById('new-nickname').value.trim();
    
    if (!currentUser) {
        showToast('Please login first');
        return;
    }
    
    const result = await updateNickname(currentUser.id, newNickname);
    
    if (result.success) {
        showToast('Nickname updated successfully!');
        document.getElementById('current-nickname').value = newNickname;
        document.getElementById('nickname-change-modal').classList.add('hidden');
        currentUserProfile = result.data;
    } else {
        showToast(result.error || 'Failed to update nickname');
    }
});
```

## Testing

1. **Test Signup**: Create a new account and check if a random nickname is assigned
2. **Test Nickname Display**: Open settings and verify your nickname is shown
3. **Test Nickname Change**: Click "Change" button, enter a new nickname, and save
4. **Test Board Display**: Create a post and verify your nickname appears as the author
