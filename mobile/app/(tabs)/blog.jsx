import { useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
export default function Blog() {
  const [posts,setPosts]=useState([]);
  useEffect(()=>{ fetch(`${API}/api/posts`).then(r=>r.json()).then(setPosts).catch(()=>{}); }, []);
  return (
    <ScrollView style={{flex:1, backgroundColor:'#FFF7F0'}} contentContainerStyle={{padding:16, gap:12}}>
      <Text style={{fontSize:22, fontWeight:'800', color:'#4A2C2A'}}>Journal</Text>
      <Text style={{color:'#6B4A4A'}}>Tutorials, Cricut tips, origami folds + behind the scenes from the studio.</Text>
      {posts.map(p=> (
        <View key={p.id} style={{backgroundColor:'white', borderRadius:16, padding:16, borderWidth:1, borderColor:'#E8CFCF'}}>
          <Text style={{fontWeight:'700', color:'#4A2C2A'}}>{p.title}</Text>
          <Text style={{color:'#6B4A4A', marginTop:4}}>{p.excerpt}</Text>
          <Text style={{color:'#B85C5C', marginTop:8, fontSize:12}}>{p.tags}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
