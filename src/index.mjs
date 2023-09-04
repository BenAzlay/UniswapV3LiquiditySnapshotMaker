import Web3 from "web3";
import { ethers } from "ethers";
import { JSBI } from "@uniswap/sdk";
import { BigNumber } from "@ethersproject/bignumber";
import NFTPositionManagerABI from './abi/NonfungiblePositionManagerAbi.json';
import UniswapV3FactoryAbi from './abi/UniswapV3FactoryAbi.json';
import UniswapPoolContractAbi from './abi/UniswapPoolContractAbi.json';
import Erc20Abi from './abi/Erc20Abi.json';

const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);
const mainnetRpc = "https://ethereum.publicnode.com";

function getTickAtSqrtRatio(sqrtPriceX96){
  let tick = Math.floor(Math.log((sqrtPriceX96/Q96)**2)/Math.log(1.0001));
  return tick;
}

const getPositionDataFromNftId = async (nftId, defaultBlock = "latest") => {
  try {
    // Get input values
    nftId = document.getElementById("nftId").value;
    defaultBlock = document.getElementById("blockNumber").value === "" ? "latest" : parseInt(document.getElementById("blockNumber").value);
    console.log(nftId, defaultBlock)
  
    const web3 = new Web3(mainnetRpc);
    // Get position token addresses and fees
    const provider = new ethers.providers.StaticJsonRpcProvider(mainnetRpc, 1);
    const positionManagerContract = new ethers.Contract(
      "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      NFTPositionManagerABI,
      provider,
    );
    const {
      token0: token0Address,
      token1: token1Address,
      fee,
      tickLower,
      tickUpper,
      liquidity,
    } = await positionManagerContract.functions.positions(nftId, { blockTag: defaultBlock });
    // Get NFT owner
    const [nftOwner] = await positionManagerContract.functions.ownerOf(nftId, { blockTag: defaultBlock });
    // Get pool address from token addresses and fee
    const uniswapV3FactoryContract = new web3.eth.Contract(UniswapV3FactoryAbi, '0x1F98431c8aD98523631AE4a59f267346ea31F984');
    const poolAddress = await uniswapV3FactoryContract.methods.getPool(token0Address, token1Address, fee).call({}, defaultBlock);
    
    // Get sqrtPriceX96 from pool contract
    const poolContract = new web3.eth.Contract(UniswapPoolContractAbi, poolAddress);
    const { sqrtPriceX96 } = await poolContract.methods.slot0().call({}, defaultBlock);
    
    // Get token decimals
    const token0Contract = new web3.eth.Contract(Erc20Abi, token0Address);
    const decimals0 = await token0Contract.methods.decimals().call({}, defaultBlock);
    // const symbol0 = await token0Contract.methods.symbol().call({}, defaultBlock);
    const token1Contract = new web3.eth.Contract(Erc20Abi, token1Address);
    const decimals1 = await token1Contract.methods.decimals().call({}, defaultBlock);
    // const symbol1 = await token1Contract.methods.symbol().call({}, defaultBlock);
    
    // Calculate amounts
    let sqrtRatioA = Math.sqrt(1.0001**tickLower).toFixed(18);
    let sqrtRatioB = Math.sqrt(1.0001**tickUpper).toFixed(18);
    let currentTick = getTickAtSqrtRatio(sqrtPriceX96);
    let currentRatio = Math.sqrt(1.0001**currentTick).toFixed(18);
    let amount0wei = 0;
    let amount1wei = 0;
    if(currentTick <= tickLower){
      amount0wei = Math.floor(liquidity*((sqrtRatioB-sqrtRatioA)/(sqrtRatioA*sqrtRatioB)));
    }
    if(currentTick > tickUpper){
        amount1wei = Math.floor(liquidity*(sqrtRatioB-sqrtRatioA));
    }
    if(currentTick >= tickLower && currentTick < tickUpper){ 
        amount0wei = Math.floor(liquidity*((sqrtRatioB-currentRatio)/(currentRatio*sqrtRatioB)));
        amount1wei = Math.floor(liquidity*(currentRatio-sqrtRatioA));
    }
    const amount0 = amount0wei / (10**decimals0);
    const amount1 = amount1wei / (10**decimals1);
    const results = document.querySelector("#results");
    results.querySelector(".position0").textContent = `${token0Address} position: ${amount0}`;
    results.querySelector(".position1").textContent = `${token1Address} position: ${amount1}`;
  
    // Get unclaimed fees
    const {
      amount0: unclaimedFee0Wei,
      amount1: unclaimedFee1Wei,
    } = await positionManagerContract.callStatic.collect({
      tokenId: nftId,
      recipient: nftOwner,
      amount0Max: MAX_UINT128,
      amount1Max: MAX_UINT128,
    }, {from: nftOwner, blockTag: defaultBlock});
    const unclaimedFee0 = unclaimedFee0Wei / (10**decimals0);
    const unclaimedFee1 = unclaimedFee1Wei / (10**decimals1);
    results.querySelector(".unclaimed0").textContent = `${token0Address} unclaimed fees: ${unclaimedFee0}`;
    results.querySelector(".unclaimed1").textContent = `${token1Address} unclaimed fees: ${unclaimedFee1}`;
  } catch (e) {
    console.error("Snapshot failed", e);
    document.querySelector(".error").textContent = "Snapshot failed, please check inputs";
  }
}

document.querySelector("#snapshotButton").addEventListener("click", getPositionDataFromNftId);

