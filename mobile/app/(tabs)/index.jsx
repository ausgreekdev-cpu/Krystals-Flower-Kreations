import { ScrollView, Text, View, Pressable, Image } from 'react-native';
import { Link } from 'expo-router';

export default function Home() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFF7F0' }} contentContainerStyle={{ padding: 16 }}>
      <View style={{ backgroundColor: '#B85C5C', borderRadius: 20, padding: 24, marginBottom: 16 }}>
        <Text style={{ color: 'white', fontSize: 28, fontWeight: '800' }}>Krystal's Flower Kreations</Text>
        <Text style={{ color: 'white', opacity: 0.9, marginTop: 8 }}>Paper florist & armature art — Perth WA. Cricut + origami blooms that last forever.</Text>
        <Link href="/shop" asChild><Pressable style={{ backgroundColor: 'white', marginTop: 16, paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}><Text style={{ color: '#B85C5C', fontWeight: '700' }}>Browse Bouquets →</Text></Pressable></Link>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <Feature title="Shop" subtitle="Bouquets, armatures & SVG templates" href="/shop" />
        <Feature title="Workshops" subtitle="Perth studio + online kits" href="/workshops" />
      </View>
      <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 8, color: '#4A2C2A' }}>Featured — made in Perth</Text>
      <Text style={{ color: '#6B4A4A' }}>API: {process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'}</Text>
      <Text style={{ color: '#6B4A4A', marginTop: 4 }}>Follow on Instagram + Facebook — shop synced via Meta Catalog.</Text>
      <Link href="/blog" asChild><Pressable style={{ marginTop: 16, borderWidth: 1, borderColor: '#E8CFCF', padding: 12, borderRadius: 12, alignItems: 'center' }}><Text style={{ color: '#4A2C2A' }}>Read the Journal — cricut tips & origami folds</Text></Pressable></Link>
    </ScrollView>
  );
}
function Feature({ title, subtitle, href }) {
  return (
    <Link href={href} asChild>
      <Pressable style={{ flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E8CFCF' }}>
        <Text style={{ fontWeight: '800', color: '#4A2C2A' }}>{title}</Text>
        <Text style={{ color: '#6B4A4A', marginTop: 4, fontSize: 12 }}>{subtitle}</Text>
      </Pressable>
    </Link>
  );
}
