import { Stack } from 'expo-router';

export default function PlanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="venues" />
      <Stack.Screen name="eta" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="invite" />
      <Stack.Screen name="suggest" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
