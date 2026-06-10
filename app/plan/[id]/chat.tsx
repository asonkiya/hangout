import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, FONT_SIZE } from '@/constants';
import type { PlanMessageRow, UserRow } from '@/types/database';

type MessageWithUser = PlanMessageRow & { users: UserRow };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<MessageWithUser[]>([]);
  const [body, setBody] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUid(user?.id ?? null));
    loadMessages();

    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plan_messages', filter: `plan_id=eq.${id}` },
        async (payload) => {
          // Fetch the new message with user data
          const { data } = await supabase
            .from('plan_messages')
            .select('*, users(*)')
            .eq('id', payload.new.id)
            .single();
          if (data) {
            setMessages((prev) => [...prev, data as unknown as MessageWithUser]);
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  async function loadMessages() {
    const { data } = await supabase
      .from('plan_messages')
      .select('*, users(*)')
      .eq('plan_id', id!)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as unknown as MessageWithUser[]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
  }

  async function send() {
    const text = body.trim();
    if (!text || !uid) return;
    setBody('');
    await supabase.from('plan_messages').insert({
      plan_id: id!,
      user_id: uid,
      body: text,
      message_type: 'text',
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>{'<-'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group chat</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No messages yet. Say hi!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMe = item.user_id === uid;
            return (
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                {!isMe && (
                  <Text style={styles.senderName}>{item.users?.display_name ?? '?'}</Text>
                )}
                <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.body}</Text>
                <Text style={[styles.time, isMe && styles.timeMe]}>
                  {new Date(item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder="Message…"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !body.trim() && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!body.trim()}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  back: { fontSize: FONT_SIZE.xl, color: COLORS.primary },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    gap: 2,
  },
  bubbleThem: { backgroundColor: COLORS.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: COLORS.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  senderName: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.primary, marginBottom: 2 },
  bubbleText: { fontSize: FONT_SIZE.md, color: COLORS.text, lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  time: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, alignSelf: 'flex-end' },
  timeMe: { color: 'rgba(255,255,255,0.7)' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    maxHeight: 100,
  },
  sendBtn: { backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.sm },
});
