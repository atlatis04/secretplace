// Profile Management Functions
import { supabase } from './supabase.js';
import { generateRandomNickname, validateNickname } from './nickname-generator.js';

// Get user profile
export async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            // If profile doesn't exist, create one
            if (error.code === 'PGRST116') {
                return await createUserProfile(userId);
            }
            throw error;
        }

        return data;
    } catch (err) {
        console.error('Error getting user profile:', err);
        return null;
    }
}

// Create user profile (for existing users who don't have a profile yet)
export async function createUserProfile(userId) {
    try {
        const nickname = generateRandomNickname();

        const { data, error } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                nickname: nickname
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Error creating user profile:', err);
        return null;
    }
}

// Update user nickname
export async function updateNickname(userId, newNickname) {
    try {
        // Validate nickname
        const validation = validateNickname(newNickname);
        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const { data, error } = await supabase
            .from('profiles')
            .update({
                nickname: newNickname.trim(),
                updated_at: new Date().toISOString()
            })
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            // Check for unique constraint violation
            if (error.code === '23505') {
                return { success: false, error: 'This nickname is already taken' };
            }
            throw error;
        }

        return { success: true, data };
    } catch (err) {
        console.error('Error updating nickname:', err);
        return { success: false, error: 'Failed to update nickname' };
    }
}

// Get nickname by user ID (helper for displaying in posts)
export async function getNickname(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data?.nickname || 'User';
    } catch (err) {
        console.error('Error getting nickname:', err);
        return 'User';
    }
}
