import {
    BasicModal,
    Box,
    Button, Link, Spinner, Stack,
    Text,
} from "@interchain-ui/react";

import {
    Stream as IStream
} from "@unification-com/fundjs-react/mainchain/stream/v1/stream";
import {exponentiate, getCoin, getExplorer, getExponent} from "@/utils";
import {useEffect, useState} from "react";
import {useChain} from "@cosmos-kit/react";
import {useClaimStream} from "@/hooks/useClaimStream";
import {coin, Coin, parseCoins} from '@cosmjs/stargate';
import {useModal} from "@/hooks";
import {useTopUpDeposit} from "@/hooks/useTopupDeposit";
import {useCalculateFlowRate} from "@/hooks/useCalculateFlowRate";
import {useUpdateFlowRate} from "@/hooks/useUpdateFlowRate";
import {useCancelSteam} from "@/hooks/useCancelStream";

export type StreamProps = {
    stream: IStream;
    sender: string;
    receiver: string;
    chainName: string;
    validatorFeePerc: number;
    walletBalance: number;
    refetchStreams?: () => void
    refetchBalanceData?: () => void
};

export function Stream({
                           stream,
                           sender,
                           receiver,
                           chainName,
                           validatorFeePerc,
                           walletBalance,
                           refetchStreams = () => {
                           },
                           refetchBalanceData = () => {
                           },
                       }: StreamProps) {

    const {address} = useChain(chainName);
    const [claimable, setClaimable] = useState(0);
    const [actualReceive, setActualReceive] = useState(0);
    const [validatorFee, setValidatorFee] = useState(0);
    const [remainingDeposit, setRemainingDeposit] = useState(0);
    const [isSender, setIsSender] = useState(address === sender);
    const [showTopUpInfo, setShowTopUpInfo] = useState(false);
    const {onClaimStream} = useClaimStream(chainName)
    const {onTopUpDeposit} = useTopUpDeposit(chainName)
    const {isCalculating, onCalculateFlowRate} = useCalculateFlowRate(chainName);
    const {onUpdateFlowRate} = useUpdateFlowRate(chainName);
    const {onCancelStream} = useCancelSteam(chainName)
    const [streamData, setStreamData] = useState(stream);
    const {modal: topupDepositModal, open: openTopupDepositModal, close: closeTopupDepositModal} = useModal("");
    const {modal: updateFlowRateModal, open: openUpdateFlowRateModal, close: closeUpdateFlowRateModal} = useModal("");
    const {
        modal: sendUpdateFlowRateModal,
        open: openSendUpdateFlowRateModal,
        close: closeSendUpdateFlowRateModal
    } = useModal("");
    const {modal: cancelStreamModal, open: openCancelStreamModal, close: closeCancelStreamModal} = useModal("");
    const {modal: statusModal, open: openStatusModal, close: closeStatusModal} = useModal("");
    const [modalContent, setModalContent] = useState(<></>)


    const [topUpFormData, setTopUpFormData] = useState({
        deposit: 100,
        deposotZeroTime: 0,
    })

    const [updateFlowFormData, setUpdateFlowFormData] = useState({
        fund: 100,
        period: 6,
        duration: 1,
        flowRate: 0,
    })

    const explorer = getExplorer(chainName)
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now()
            const timeSince = now - streamData.lastOutflowTime.getTime()
            const flowMs = parseInt(streamData.flowRate.toString(), 10) / 1000
            let claimable = flowMs * timeSince
            const remainingDeposit = parseInt(streamData.deposit.amount.toString(), 10)
            if (claimable > remainingDeposit) {
                claimable = remainingDeposit
            }
            const remaining = remainingDeposit - claimable
            const valFee = claimable * validatorFeePerc

            setShowTopUpInfo(false)
            if (now > streamData.depositZeroTime.getTime() && claimable > 0) {
                setShowTopUpInfo(true)
            }

            setClaimable(claimable)
            setValidatorFee(valFee)
            setActualReceive(claimable - valFee)
            setRemainingDeposit(remaining > 0 ? remaining : 0)
        }, 100);
        return () => {
            clearInterval(interval);
        };
    }, [streamData, validatorFeePerc]);

    function handleClaimSubmit(e: { preventDefault: () => void; }) {
        e.preventDefault();
        setModalContent(
            <>
                <Text fontSize="$lg" fontWeight={"$bold"}>
                    Approx. Total Claim: {exponentiate(claimable, -exponent).toFixed(9)} {chainCoin.symbol}
                </Text>

                <Text fontSize="$sm">
                    Note - actual amount is calculated on-chain at the block time the transaction is processed
                </Text>

                <Text fontSize="$lg">
                    <strong>You will receive
                        approx.:</strong> {exponentiate(actualReceive, -exponent).toFixed(3)} {chainCoin.symbol}
                </Text>
                <Text fontSize="$lg">
                    <strong>{validatorFeePerc * 100}% Validator Fee
                        approx.:</strong> {exponentiate(validatorFee, -exponent).toFixed(3)} {chainCoin.symbol}
                </Text>
                <Text fontSize="$lg">
                    <Spinner
                        size="$5xl"
                    /> Sending transaction
                </Text>
            </>
        )
        openStatusModal();
        onClaimStream({
            sender,
            success: onClaimStreamSuccess,
            error: onSendTxError,
        })
    }

    function handleOnCloseStatusModal() {
        closeStatusModal()
        refetchStreams()
        refetchBalanceData()
    }

    function onClaimStreamSuccess(remaining: Coin, txHash: string | undefined) {
        setStreamData({...streamData, lastOutflowTime: new Date(), deposit: remaining})

        let explorerUrl = <>{txHash}</>
        if (explorer.tx_page !== undefined && txHash != null) {
            const url = explorer.tx_page.replace("${txHash}", txHash)
            explorerUrl = <Link href={url} target={"_blank"}>{txHash}</Link>
        }

        setModalContent(
            <Text fontSize="$lg">
                Claim successful<br/>
                {explorerUrl}
            </Text>
        )
    }

    function onSendTxError(errMsg: string) {
        setModalContent(
            <>
                <Text fontSize="$lg" fontWeight={"$bold"}>
                    Error:
                </Text>
                <Text fontSize="$lg">
                    {errMsg}
                </Text>
            </>
        )
    }

    function handleTopupDepositInputChange(e: { target: { name: any; value: any; }; }) {
        const {name, value} = e.target;
        setTopUpFormData({...topUpFormData, [name]: value});
    }

    function handleTopupDepositSubmit(e: { preventDefault: () => void; }) {
        e.preventDefault();
        setModalContent(<Text fontSize="$lg">
            <Spinner
                size="$5xl"
            /> Sending transaction
        </Text>)
        openStatusModal();
        closeTopupDepositModal()
        const nund = exponentiate(topUpFormData.deposit, exponent)


        if (nund > walletBalance) {
            onSendTxError("Cannot deposit more than balance")
            return
        }

        onTopUpDeposit({
            receiver,
            deposit: nund,
            success: onTopUpDepositSuccess,
            error: onSendTxError,
        })
    }

    function onTopUpDepositSuccess(depositZeroTime: string, txHash: string | undefined) {
        const nund = exponentiate(topUpFormData.deposit, exponent)
        const newDeposit = coin(parseInt(streamData.deposit.amount, 10) + nund, "nund")
        setStreamData({...streamData, deposit: newDeposit, depositZeroTime: new Date(depositZeroTime)})

        let explorerUrl = <>{txHash}</>
        if (explorer.tx_page !== undefined && txHash != null) {
            const url = explorer.tx_page.replace("${txHash}", txHash)
            explorerUrl = <Link href={url} target={"_blank"}>{txHash}</Link>
        }

        setModalContent(<Text fontSize="$lg">
            Top Up successful<br/>
            {explorerUrl}
        </Text>)
    }

    function handleUpdateFlowRateInputChange(e: { target: { name: any; value: any; }; }) {
        const {name, value} = e.target;
        setUpdateFlowFormData({...updateFlowFormData, [name]: value});
    }

    function handleUpdateFlowRateSubmit(e: { preventDefault: () => void; }) {
        e.preventDefault();
        setModalContent(<Text fontSize="$lg">
            <Spinner
                size="$5xl"
            /> Sending transaction
        </Text>)
        closeSendUpdateFlowRateModal()

        const nund = exponentiate(updateFlowFormData.fund, exponent)
        const nundCoin = `${nund}nund`

        onCalculateFlowRate({
            coin: nundCoin,
            period: updateFlowFormData.period,
            duration: updateFlowFormData.duration,
            success: onCalculateFlowRateSuccess,
        })
    }

    function onCalculateFlowRateSuccess(flowRate: string) {
        setUpdateFlowFormData({...updateFlowFormData, flowRate: parseInt(flowRate, 10)});
        closeUpdateFlowRateModal()
        openSendUpdateFlowRateModal()
    }

    function handleSendUpdateFlowRateSubmit(e: { preventDefault: () => void; }) {
        e.preventDefault();
        setModalContent(<Text fontSize="$lg">
            <Spinner
                size="$5xl"
            /> Sending transaction
        </Text>)
        openStatusModal();
        closeSendUpdateFlowRateModal()

        onUpdateFlowRate({
            receiver,
            flowRate: updateFlowFormData.flowRate,
            success: onSendUpdateFlowRateSuccess,
            error: onSendTxError,
        })
    }

    function onSendUpdateFlowRateSuccess(newFlowRate: string, depositZeroTime: string, remainingDeposit: string, txHash: string | undefined) {
        const parsedCoins = parseCoins(remainingDeposit)
        setStreamData({
                ...streamData,
                flowRate: BigInt(newFlowRate),
                depositZeroTime: new Date(depositZeroTime),
                deposit: parsedCoins[0],
                lastOutflowTime: new Date(),
            }
        )

        let explorerUrl = <>{txHash}</>
        if (explorer.tx_page !== undefined && txHash != null) {
            const url = explorer.tx_page.replace("${txHash}", txHash)
            explorerUrl = <Link href={url} target={"_blank"}>{txHash}</Link>
        }

        setModalContent(<Text fontSize="$lg">
            Update flow rate successful<br/>
            {explorerUrl}
        </Text>)
    }

    function onCancelStreamSuccess(txHash: string | undefined) {

        setStreamData({
                ...streamData,
                flowRate: BigInt(0),
                depositZeroTime: new Date(Date.now()),
                deposit: coin(0, "nund"),
                lastOutflowTime: new Date(Date.now()),
            }
        )

        let explorerUrl = <>{txHash}</>
        if (explorer.tx_page !== undefined && txHash != null) {
            const url = explorer.tx_page.replace("${txHash}", txHash)
            explorerUrl = <Link href={url} target={"_blank"}>{txHash}</Link>
        }

        setModalContent(<Text fontSize="$lg">
            Cancel stream successful <br/>
            {explorerUrl}
        </Text>)
    }

    function handleCancelStreamSubmit(e: { preventDefault: () => void; }) {
        e.preventDefault();
        setModalContent(<Text fontSize="$lg">
            <Spinner
                size="$5xl"
            /> Sending transaction
        </Text>)
        openStatusModal();
        closeCancelStreamModal()

        onCancelStream({
            receiver,
            success: onCancelStreamSuccess,
            error: onSendTxError,
        })
    }

    const chainCoin = getCoin(chainName);
    const exponent = getExponent(chainName);

    const claim = (
        <Button intent="primary" size={"sm"} onClick={handleClaimSubmit}>
            Claim
        </Button>
    )

    const editButtons = (

        <Stack
            direction="vertical"
            space="$6"
        >
            <Button intent="tertiary" size={"sm"} onClick={openTopupDepositModal}>
                Top Up Deposit
            </Button>
            <Button intent="tertiary" size={"sm"} onClick={openUpdateFlowRateModal}>
                Update Flow Rate
            </Button>
            <Button intent="danger" size={"sm"} onClick={openCancelStreamModal}>
                Cancel Stream
            </Button>
        </Stack>
    )

    const accExplorerLink = (
        isSender ?
            (explorer.account_page ? <Link href={explorer.account_page.replace("${accountAddress}", receiver)}
                                           target={"_blank"}>{receiver}</Link> : receiver)
            :
            (explorer.account_page ? <Link href={explorer.account_page.replace("${accountAddress}", sender)}
                                           target={"_blank"}>{sender}</Link> : sender)
    )

    return (
        <Box mt="$8" width="70%" display="table" borderRadius="$lg" backgroundColor="$cardBg" px="$4"
             py="$4">

            <Box mt="$8" display="table-row">
                <Box mt="$8" display="table-cell">
                    <Box mt="$8" display="table-row">
                        <Box mt="$8" display="table-cell" width={4}>
                            <Text
                                fontSize="$sm"
                                fontWeight="$bold"
                            >
                                {isSender ? "To" : "From"}:
                            </Text>
                        </Box>
                        <Box mt="$8" display="table-cell">
                            <Text
                                fontSize="$sm"
                                fontWeight="$bold"
                            >
                                {accExplorerLink}
                            </Text>
                        </Box>
                    </Box>
                    <Box mt="$8" display="table-row">
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                Flow Rate:
                            </Text>
                        </Box>
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                {exponentiate(streamData.flowRate?.toString(), -exponent).toFixed(9)} {chainCoin.symbol} /
                                sec
                            </Text>
                        </Box>
                    </Box>
                    <Box mt="$8" display="table-row">
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                Deposit:
                            </Text>
                        </Box>
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                {exponentiate(streamData.deposit.amount.toString(), -exponent).toFixed(9)} {chainCoin.symbol}
                            </Text>
                        </Box>
                    </Box>
                    <Box mt="$8" display="table-row">
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                Deposit Zero Time:
                            </Text>
                        </Box>
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                {streamData.depositZeroTime.toLocaleString('en-GB')}
                            </Text>
                        </Box>
                    </Box>
                    <Box mt="$8" display="table-row">
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                Last Claim Time:
                            </Text>
                        </Box>
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                {streamData.lastOutflowTime.toLocaleString('en-GB')}
                            </Text>
                        </Box>
                    </Box>
                    <Box mt="$8" display="table-row">
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                Claimable:
                            </Text>
                        </Box>
                        <Box mt="$8" display="table-cell">
                            <Text fontSize="$sm" fontWeight="$bold">
                                {exponentiate(claimable, -exponent).toFixed(9)} {chainCoin.symbol}
                            </Text>
                        </Box>
                    </Box>
                </Box>

                <Box mt="$8" display="table-cell">
                    <Box mt="$8" display="table-cell">
                        <Text fontSize="$sm" fontWeight="$bold">
                            {isSender ? editButtons : claim}
                        </Text>
                    </Box>
                </Box>
            </Box>

            <Box mt="$8" display="table-row">
                <Box mt="$8" display="table-cell">

                </Box>

            </Box>

            <BasicModal
                title={
                    <Box maxWidth="40rem">
                        <Text fontSize="$xl" fontWeight="$bold">Top Up Deposit</Text>
                    </Box>
                }
                isOpen={topupDepositModal.open}
                onOpen={openTopupDepositModal}
                onClose={closeTopupDepositModal}
            >
                <form onSubmit={handleTopupDepositSubmit} className={"payment-stream-form"}>

                    <Text>
                        Deposit:
                        <input type="text" name="deposit" size={3} value={topUpFormData.deposit}
                               onChange={handleTopupDepositInputChange}/> {chainCoin.symbol}
                    </Text>
                    {
                        showTopUpInfo ?
                            <Box position="relative" maxWidth={"$containerSm"}>
                                <Text fontSize="$sm">
                                    Note: the &quot;deposit zero time&quot; has passed. Any remaining unclaimed funds
                                    will<br/>
                                    be automatically forwarded to the receiver wallet as part of this Top Up
                                    transaction.
                                </Text>
                            </Box>
                            : null
                    }
                    <br/>
                    <button type="submit">Top Up</button>
                </form>
            </BasicModal>

            <BasicModal
                title={
                    <Box maxWidth="40rem">
                        <Text fontSize="$xl" fontWeight="$bold">Update Flow Rate</Text>
                    </Box>
                }
                isOpen={updateFlowRateModal.open}
                onOpen={openUpdateFlowRateModal}
                onClose={closeUpdateFlowRateModal}
            >
                <form onSubmit={handleUpdateFlowRateSubmit} className={"payment-stream-form"}>

                    <Text>
                        Send:
                        <input type="text" name="fund" value={updateFlowFormData.fund}
                               onChange={handleUpdateFlowRateInputChange}/> FUND
                    </Text>
                    <Text>
                        Every
                        <input type="text" size={1} name="duration" value={updateFlowFormData.duration}
                               onChange={handleUpdateFlowRateInputChange}/>
                        <select value={updateFlowFormData.period} onChange={handleUpdateFlowRateInputChange}
                                name="period">
                            <option value="2">Minute{updateFlowFormData.duration > 1 ? 's' : null}</option>
                            <option value="3">Hour{updateFlowFormData.duration > 1 ? 's' : null}</option>
                            <option value="4">Day{updateFlowFormData.duration > 1 ? 's' : null}</option>
                            <option value="5">Week{updateFlowFormData.duration > 1 ? 's' : null}</option>
                            <option value="6">Month{updateFlowFormData.duration > 1 ? 's' : null}</option>
                            <option value="7">Year{updateFlowFormData.duration > 1 ? 's' : null}</option>
                        </select>
                    </Text>
                    <Button size={"sm"}>Calculate</Button>
                </form>
            </BasicModal>

            <BasicModal
                title={
                    <Box maxWidth="40rem">
                        <Text fontSize="$xl" fontWeight="$bold">Send New Flow Rate</Text>
                    </Box>
                }
                isOpen={sendUpdateFlowRateModal.open}
                onOpen={openSendUpdateFlowRateModal}
                onClose={closeSendUpdateFlowRateModal}
            >
                <form onSubmit={handleSendUpdateFlowRateSubmit} className={"payment-stream-form"}>

                    <Text
                        color="$textSecondary"
                        fontSize="$sm"
                        fontWeight="$semibold"
                    >
                        Updating the flow rate will also result in
                        approx. {exponentiate(claimable, -exponent).toFixed(3)} {chainCoin.symbol} being
                        sent to the receiver before the new flow rate is applied.
                    </Text>
                    <br/>
                    <Text>
                        <strong>New Flow Rate:</strong> {updateFlowFormData.flowRate} nund/sec
                        ({exponentiate(updateFlowFormData.flowRate, -exponent).toFixed(9)} {chainCoin.symbol} / sec)
                        <input type="hidden" name="flowRate" value={updateFlowFormData.flowRate}/> FUND
                    </Text>
                    <Button size={"sm"}>Send</Button>
                </form>
            </BasicModal>


            <BasicModal
                title={
                    <Box maxWidth="40rem">
                        <Text fontSize="$xl" fontWeight="$bold">Cancel Stream</Text>
                    </Box>
                }
                isOpen={cancelStreamModal.open}
                onOpen={openCancelStreamModal}
                onClose={closeCancelStreamModal}
            >
                <form onSubmit={handleCancelStreamSubmit} className={"payment-stream-form"}>

                    <Text
                        color="$textSecondary"
                        fontSize="$sm"
                        fontWeight="$semibold"
                    >
                        Cancelling the stream result in
                        approx. {exponentiate(claimable, -exponent).toFixed(3)} {chainCoin.symbol} being
                        sent to the receiver.
                        <br/>
                        You will be refunded
                        approx. {exponentiate(remainingDeposit, -exponent).toFixed(3)} {chainCoin.symbol}
                    </Text>
                    <Button size={"sm"}>Cancel Stream</Button>
                </form>
            </BasicModal>

            <BasicModal
                title={
                    <Box maxWidth="40rem">
                        <Text fontSize="$xl" fontWeight="$bold"></Text>
                    </Box>
                }
                isOpen={statusModal.open}
                onOpen={openStatusModal}
                onClose={handleOnCloseStatusModal}
            >

                <Box position="relative" maxWidth={"$containerSm"}>
                    {modalContent}
                </Box>

            </BasicModal>
        </Box>
    )
}
