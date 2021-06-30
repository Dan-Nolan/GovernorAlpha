pragma solidity ^0.5.16;

contract Example {
  uint public x = 0;

  function setX(uint _x) external {
    x = _x;
  }
}
