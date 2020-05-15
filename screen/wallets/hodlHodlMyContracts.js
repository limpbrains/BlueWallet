/* global alert */
import React, { Component } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from 'react-native';
import { BlueButton, BlueButtonLink, BlueLoading, BlueNavigationStyle, BlueSpacing20, SafeBlueArea } from '../../BlueComponents';
import { AppStorage } from '../../class';
import { HodlHodlApi } from '../../class/hodl-hodl-api';
import Modal from 'react-native-modal';

const BlueApp: AppStorage = require('../../BlueApp');

const styles = StyleSheet.create({
  bottomModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    minHeight: 400,
    height: 400,
  },
});

export default class HodlHodlMyContracts extends Component {
  static navigationOptions = ({ navigation }) => ({
    ...BlueNavigationStyle(navigation, true),
    title: 'My contracts',
    headerLeft: null,
  });

  constructor(props) {
    super(props);

    this.state = {
      contracts: [],
      isLoading: true,
    };
  }

  componentWillUnmount() {
    clearInterval(this.state.inverval);
  }

  async componentDidMount() {
    const hodlApiKey = await BlueApp.getHodlHodlApiKey();
    const hodlApi = new HodlHodlApi(hodlApiKey);
    this.setState({ hodlApi: hodlApi, contracts: [] });

    const inverval = setInterval(async () => {
      await this.refetchContracts();
    }, 60 * 1000);

    this.setState({ inverval });
    await this.refetchContracts();
  }

  render() {
    if (this.state.isLoading) return <BlueLoading />;
    return (
      <SafeBlueArea>
        <FlatList
          scrollEnabled={false}
          keyExtractor={(item, index) => {
            return item.id;
          }}
          ListEmptyComponent={() => (
            <Text style={{ textAlign: 'center', color: '#9AA0AA', paddingHorizontal: 16 }}>You dont have any contracts in progress</Text>
          )}
          style={{ width: '100%' }}
          ItemSeparatorComponent={() => <View style={{ height: 0.5, width: '100%', backgroundColor: '#C8C8C8' }} />}
          data={this.state.contracts}
          renderItem={({ item: contract, index, separators }) => (
            <TouchableHighlight
              onShowUnderlay={separators.highlight}
              onHideUnderlay={separators.unhighlight}
              onPress={() => this._onContractPress(contract)}
            >
              <View style={{ backgroundColor: 'white', flex: 1, flexDirection: 'column', padding: 20 }}>
                <Text style={{ fontSize: 18, color: '#0c2550', fontWeight: 'normal' }}>
                  {contract.your_role === 'buyer' ? 'buying' : 'selling'} {contract.volume} {contract.asset_code} ({contract.status})
                </Text>
                <Text style={{ fontSize: 14, color: '#0c2550', fontWeight: 'normal' }}>
                  {contract.isDepositedEnought
                    ? 'Bitcoins are in escrow! Please pay seller via agreed payment method'
                    : 'waiting for seller to deposit bitcoins to escrow...'}
                </Text>
              </View>
            </TouchableHighlight>
          )}
        />
        {this.renderContract()}
      </SafeBlueArea>
    );
  }

  async refetchContracts() {
    this.setState({
      isLoading: true,
    });

    const hodlApi = this.state.hodlApi;
    let contracts = [];

    // await BlueApp.addHodlHodlContract('hhWRIz1UZFdDRurr'); // debug fixme
    const contractIds = await BlueApp.getHodlHodlContracts();

    /*
     * Initiator sends “Getting contract” request once every 1-3 minutes until contract.escrow.address is not null (thus, waiting for offer’s creator to confirm his payment password in case he uses the website)
     * Each party verifies the escrow address locally
     * Each party sends “Confirming contract’s escrow validity” request to the server
     */
    for (const id of contractIds) {
      const contract = await hodlApi.getContract(id);
      if (contract.status === 'canceled') continue;
      if (contract.escrow && contract.escrow.address && hodlApi.verifyEscrowAddress()) {
        await hodlApi.markContractAsConfirmed(id);
        contract.isDepositedEnought = false;
        contract.isDepositedEnought =
          contract.escrow.confirmations >= contract.confirmations && +contract.escrow.amount_deposited >= +contract.volume;
      }

      contracts.push(contract);
    }

    this.setState({ hodlApi: hodlApi, contracts, isLoading: false });
  }

  _onContractPress(contract) {
    this.setState({
      contractToDisplay: contract,
      isRenderContractVisible: true,
    });
  }

  renderContract = () => {
    if (!this.state.contractToDisplay) return;

    return (
      <Modal
        isVisible={this.state.isRenderContractVisible}
        style={styles.bottomModal}
        onBackdropPress={() => {
          Keyboard.dismiss();
          this.setState({ isRenderContractVisible: false });
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : null}>
          <View style={styles.modalContent}>
            <Text>
              Price: {this.state.contractToDisplay.price} {this.state.contractToDisplay.currency_code} per{' '}
              {this.state.contractToDisplay.asset_code}
            </Text>
            <Text>
              You will get: {this.state.contractToDisplay.volume_breakdown.goes_to_buyer} {this.state.contractToDisplay.asset_code}
            </Text>
            <Text>To: {this.state.contractToDisplay.release_address}</Text>
            <Text onPress={() => Linking.openURL(`https://blockstream.info/address/${this.state.contractToDisplay.escrow.address}`)}>
              Escrow: {this.state.contractToDisplay.escrow.address}
            </Text>
            <BlueSpacing20 />
            <Text>How to pay seller:</Text>
            <Text>{this.state.contractToDisplay.payment_method_instruction.details}</Text>

            <BlueSpacing20 />

            {this.state.contractToDisplay.status === 'in_progress' && this.state.contractToDisplay.your_role === 'buyer' && (
              <View>
                <BlueButton title="Mark contract as Paid" onPress={() => this._onMarkContractAsPaid()} />
                <BlueSpacing20 />
              </View>
            )}

            {this.state.contractToDisplay.can_be_canceled && (
              <Text
                onPress={() => this._onCancelContract()}
                style={{ color: '#d0021b', fontSize: 15, fontWeight: '500', textAlign: 'center' }}
              >
                {'Cancel contract'}
              </Text>
            )}

            <BlueButtonLink
              title="View offer on the HodlHodl website"
              onPress={async () => {
                Linking.openURL('https://hodlhodl.com/offers/' + this.state.contractToDisplay.offer_id);
              }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  /**
   * If you are the buyer, DO NOT SEND PAYMENT UNTIL CONTRACT STATUS IS "in_progress".
   */
  _onMarkContractAsPaid() {
    if (!this.state.contractToDisplay) return;

    Alert.alert(
      'Are you sure you want to mark this contract as paid?',
      `Do this only if you sent funds to the seller via agreed payment method`,
      [
        {
          text: 'Yes',
          onPress: async () => {
            const hodlApi = this.state.hodlApi;
            try {
              await hodlApi.markContractAsPaid(this.state.contractToDisplay.id);
              this.setState({ isRenderContractVisible: false });
              await this.refetchContracts();
            } catch (Error) {
              alert(Error);
            }
          },
          style: 'default',
        },
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
      ],
      { cancelable: true },
    );
  }

  _onCancelContract() {
    if (!this.state.contractToDisplay) return;

    Alert.alert(
      'Are you sure you want to cancel this contract?',
      ``,
      [
        {
          text: 'Yes, cancel contract',
          onPress: async () => {
            const hodlApi = this.state.hodlApi;
            try {
              await hodlApi.cancelContract(this.state.contractToDisplay.id);
              this.setState({ isRenderContractVisible: false });
              await this.refetchContracts();
            } catch (Error) {
              alert(Error);
            }
          },
          style: 'default',
        },
        {
          text: 'No',
          onPress: () => {},
          style: 'cancel',
        },
      ],
      { cancelable: true },
    );
  }
}
