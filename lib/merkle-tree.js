'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');

/**
 * Implements a merkle hash tree
 * @constructor
 * @param {Array} leaves - Initial tree input
 * @param {Function} hasher - Hash function for building tree
 */
class MerkleTree {
  constructor(leaves, hasher) {
    this._hasher = hasher || this._hasher;
    this._leaves = [];
    this._depth = 0;
    this._rows = [];
    this._count = 0;

    assert(Array.isArray(leaves), 'Invalid leaves array supplied');
    assert(typeof this._hasher === 'function', 
      'Invalid hash function supplied');

    for (var i = 0; i < leaves.length; i++) {
      this._feed(leaves[i]);
    }

    this._compute();
  }

  /**
   * Computes the tree depth
   * @returns {Number}
   */
  depth() {
    if (!this._depth) {
      var pow = 0;

      while (Math.pow(2, pow) < this._leaves.length){
        pow++;
      }

      this._depth = pow;
    }

    return this._depth;
  }

  /**
   * Returns the number of levels in the tree
   * @returns {Number}
   */
  levels() {
    return this.depth() + 1;
  }

  /**
   * Returns the number of nodes in the tree
   * @returns {Number}
   */
  nodes() {
    return this._count;
  }

  /**
   * Returns the merkle root of the tree
   * @returns {String}
   */
  root() {
    return this._rows[0][0];
  }

  /**
   * Returns the leaves at the given level
   * @param {Number} level
   * @returns {String}
   */
  level(level) {
    return this._rows[level];
  }

  /**
   * Inserts leaf into bottom of tree
   * @private
   * @param {String} data
   * @returns {MerkleTree}
   */
  _feed(data) {
    this._leaves.push(data);

    return this;
  }

  /**
   * Builds the tree from the leaves
   */
  _compute() {
    var depth = this.depth();

    if (this._rows.length === 0) {
      for (var i = 0; i < depth; i++) {
        this._rows.push([]);
      }

      this._rows[depth] = this._leaves;

      for (var j = depth - 1; j >= 0; j--) {
        this._rows[j] = this._getNodes(this._rows[j + 1]);
        this._count += this._rows[j].length;
      }
    }
  }

  /**
   * Returns the nodes derived from the given leaves
   * @param {Array} leaves
   * @returns {Array}
   */
  _getNodes(leaves) {
    var remainder = leaves.length % 2;
    var nodes = [];

    for (var i = 0; i < leaves.length - 1; i = i + 2) {
      nodes[i / 2] = this._hasher(Buffer.concat([leaves[i], leaves[i + 1]]));
    }

    if (remainder === 1){
      nodes[(leaves.length - remainder) / 2] = leaves[leaves.length - 1];
    }

    return nodes;
  }

  /**
   * Default hash function (SHA-256)
   * @param {String} input
   * @returns {String}
   */
  _hasher(input) {
    return crypto.createHash('sha256').update(input).digest();
  }

}

module.exports = MerkleTree;
