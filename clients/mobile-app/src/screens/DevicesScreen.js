import React, { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  FAB,
  Badge,
  ActivityIndicator,
} from 'react-native-paper';
import { devices } from '../api/client';

export default function DevicesScreen({ navigation }) {
  const [deviceList, setDeviceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDevices = async () => {
    try {
      const data = await devices.getAll();
      setDeviceList(Object.values(data));
    } catch (error) {
      console.error('Error loading devices:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadDevices();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ONLINE':
        return '#4CAF50';
      case 'OFFLINE':
        return '#757575';
      case 'ERROR':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const renderDevice = ({ item }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('DeviceDetail', { device: item })}
    >
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Title>{item.name}</Title>
            <Badge
              style={[
                styles.badge,
                { backgroundColor: getStatusColor(item.status) },
              ]}
            >
              {item.status}
            </Badge>
          </View>
          <Paragraph>{item.type}</Paragraph>
          <Paragraph style={styles.deviceId}>ID: {item.id}</Paragraph>
        </Card.Content>
        <Card.Actions>
          <Button
            mode="outlined"
            onPress={() =>
              navigation.navigate('DeviceFiles', { deviceId: item.id })
            }
          >
            Files
          </Button>
          <Button
            mode="contained"
            onPress={() =>
              navigation.navigate('DeviceControl', { deviceId: item.id })
            }
          >
            Control
          </Button>
        </Card.Actions>
      </Card>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={deviceList}
        renderItem={renderDevice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
      <FAB
        style={styles.fab}
        icon="plus"
        onPress={() => navigation.navigate('AddDevice')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    color: 'white',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

