import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  ScrollView,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { utils, write } from 'xlsx';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

const STORAGE_KEY = '@expenses';
const CURRENCY_KEY = '@currency';
const CURRENCIES = ['PLN', 'EUR', 'USD'];

export default function App() {
  const [price, setPrice] = useState('');
  const [what, setWhat] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [currency, setCurrency] = useState('PLN');
  const [showList, setShowList] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const listAnim = useRef(new Animated.Value(0)).current;
  const priceRef = useRef(null);
  const whatRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    Animated.timing(listAnim, {
      toValue: showList ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [showList]);

  async function loadData() {
    try {
      const [stored, storedCurrency] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(CURRENCY_KEY),
      ]);
      if (stored) setExpenses(JSON.parse(stored));
      if (storedCurrency) setCurrency(storedCurrency);
    } catch {}
  }

  async function saveExpenses(list) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  async function saveCurrency(c) {
    await AsyncStorage.setItem(CURRENCY_KEY, c);
  }

  function addExpense() {
    const trimmedWhat = what.trim();
    const parsedPrice = parseFloat(price.replace(',', '.'));

    if (!trimmedWhat) {
      whatRef.current?.focus();
      return;
    }
    if (!price || isNaN(parsedPrice) || parsedPrice <= 0) {
      priceRef.current?.focus();
      return;
    }

    const newExpense = {
      id: Date.now().toString(),
      price: parsedPrice,
      what: trimmedWhat,
      currency,
      date: new Date().toISOString(),
    };

    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    saveExpenses(updated);
    setPrice('');
    setWhat('');
    priceRef.current?.focus();
  }

  function deleteExpense(id) {
    Alert.alert('Delete', 'Remove this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const updated = expenses.filter((e) => e.id !== id);
          setExpenses(updated);
          saveExpenses(updated);
        },
      },
    ]);
  }

  async function exportToExcel() {
    if (expenses.length === 0) {
      Alert.alert('Nothing to export', 'Add some expenses first.');
      return;
    }

    const rows = expenses.map((e) => ({
      Date: new Date(e.date).toLocaleDateString('pl-PL'),
      What: e.what,
      Price: e.price,
      Currency: e.currency,
    }));

    const ws = utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 8 }];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Expenses');

    const wbout = write(wb, { type: 'base64', bookType: 'xlsx' });
    const filename = `expenses_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const path = FileSystem.cacheDirectory + filename;

    await FileSystem.writeAsStringAsync(path, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await Sharing.shareAsync(path, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export expenses',
      UTI: 'com.microsoft.excel.xlsx',
    });
  }

  function selectCurrency(c) {
    setCurrency(c);
    saveCurrency(c);
    setShowCurrencyPicker(false);
  }

  const total = expenses.reduce((sum, e) => sum + e.price, 0);

  return (
    <View style={styles.root}>
      <ExpoStatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Expenses</Text>
            <TouchableOpacity
              style={styles.currencyBtn}
              onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
            >
              <Text style={styles.currencyBtnText}>{currency} ▾</Text>
            </TouchableOpacity>
          </View>

          {/* Currency picker */}
          {showCurrencyPicker && (
            <View style={styles.currencyPicker}>
              {CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.currencyOption, c === currency && styles.currencyOptionActive]}
                  onPress={() => selectCurrency(c)}
                >
                  <Text style={[styles.currencyOptionText, c === currency && styles.currencyOptionTextActive]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Input area */}
          <View style={styles.inputCard}>
            <View style={styles.inputRow}>
              <View style={styles.priceWrapper}>
                <Text style={styles.inputLabel}>Price</Text>
                <TextInput
                  ref={priceRef}
                  style={styles.priceInput}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0.00"
                  placeholderTextColor="#bbb"
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => whatRef.current?.focus()}
                  autoFocus
                />
              </View>
              <View style={styles.whatWrapper}>
                <Text style={styles.inputLabel}>What</Text>
                <TextInput
                  ref={whatRef}
                  style={styles.whatInput}
                  value={what}
                  onChangeText={setWhat}
                  placeholder="coffee, groceries…"
                  placeholderTextColor="#bbb"
                  returnKeyType="done"
                  onSubmitEditing={addExpense}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.addBtn} onPress={addExpense} activeOpacity={0.8}>
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {/* Summary + list toggle */}
          {expenses.length > 0 && (
            <View style={styles.summaryRow}>
              <TouchableOpacity style={styles.listToggle} onPress={() => setShowList(!showList)}>
                <Text style={styles.listToggleText}>
                  {showList ? 'Hide list' : `Show list (${expenses.length})`}
                </Text>
              </TouchableOpacity>
              <Text style={styles.total}>
                {total % 1 === 0 ? total.toFixed(0) : total.toFixed(2)} {currency}
              </Text>
            </View>
          )}

          {/* List */}
          {showList && (
            <Animated.View style={{ opacity: listAnim }}>
              {expenses.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.expenseItem}
                  onLongPress={() => deleteExpense(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.expenseLeft}>
                    <Text style={styles.expenseWhat}>{item.what}</Text>
                    <Text style={styles.expenseDate}>
                      {new Date(item.date).toLocaleDateString('pl-PL')}
                    </Text>
                  </View>
                  <Text style={styles.expensePrice}>
                    {item.price % 1 === 0 ? item.price.toFixed(0) : item.price.toFixed(2)}{' '}
                    <Text style={styles.expenseCurrency}>{item.currency}</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Export */}
          {expenses.length > 0 && (
            <TouchableOpacity style={styles.exportBtn} onPress={exportToExcel} activeOpacity={0.8}>
              <Text style={styles.exportBtnText}>Export to Excel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#1c1c1e',
    letterSpacing: -0.5,
  },
  currencyBtn: {
    backgroundColor: '#e5e5ea',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  currencyBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  currencyPicker: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 6,
    marginBottom: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  currencyOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  currencyOptionActive: {
    backgroundColor: '#1c1c1e',
  },
  currencyOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8e8e93',
  },
  currencyOptionTextActive: {
    color: '#fff',
  },
  inputCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  priceWrapper: {
    width: 110,
  },
  whatWrapper: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e93',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceInput: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1c1c1e',
    padding: 0,
  },
  whatInput: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1c1c1e',
    padding: 0,
    paddingTop: 4,
  },
  addBtn: {
    backgroundColor: '#1c1c1e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listToggle: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  listToggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007aff',
  },
  total: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  expenseItem: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  expenseLeft: {
    flex: 1,
    marginRight: 12,
  },
  expenseWhat: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1c1c1e',
  },
  expenseDate: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 2,
  },
  expensePrice: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  expenseCurrency: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8e8e93',
  },
  exportBtn: {
    backgroundColor: '#34c759',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  exportBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
