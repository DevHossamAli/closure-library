// Copyright 2011 The Closure Library Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

goog.provide('goog.stats.BasicStatTest');
goog.setTestOnly('goog.stats.BasicStatTest');

goog.require('goog.array');
goog.require('goog.stats.BasicStat');
goog.require('goog.string.format');
goog.require('goog.testing.PseudoRandom');
goog.require('goog.testing.jsunit');
goog.require('goog.userAgent');

function testGetSlotBoundary() {
  var stat = new goog.stats.BasicStat(1654);
  assertEquals('Checking interval', 33, stat.slotInterval_);

  assertEquals(132, stat.getSlotBoundary_(125));
  assertEquals(165, stat.getSlotBoundary_(132));
  assertEquals(132, stat.getSlotBoundary_(99));
  assertEquals(99, stat.getSlotBoundary_(98));
}

function testCheckForTimeTravel() {
  var stat = new goog.stats.BasicStat(1000);

  // no slots yet, should always be OK
  stat.checkForTimeTravel_(100);
  stat.checkForTimeTravel_(-1);

  stat.incBy(1, 125);  // creates a first bucket, ending at t=140

  // Even though these go backwards in time, our basic fuzzy check passes
  // because we just check that the time is within the latest interval bucket.
  stat.checkForTimeTravel_(141);
  stat.checkForTimeTravel_(140);
  stat.checkForTimeTravel_(139);
  stat.checkForTimeTravel_(125);
  stat.checkForTimeTravel_(124);
  stat.checkForTimeTravel_(120);

  // State should still be the same, all of the above times are valid.
  assertEquals('State unchanged when called with good times', 1, stat.get(125));

  stat.checkForTimeTravel_(119);
  assertEquals('Reset after called with a bad time', 0, stat.get(125));
}

function testConstantIncrementPerSlot() {
  var stat = new goog.stats.BasicStat(1000);

  var now = 1000;
  for (var i = 0; i < 50; ++i) {
    var newMax = 1000 + i;
    var newMin = 1000 - i;
    stat.incBy(newMin, now);
    stat.incBy(newMax, now);

    var msg = goog.string.format(
        'now=%d i=%d newMin=%d newMax=%d', now, i, newMin, newMax);
    assertEquals(msg, 2000 * (i + 1), stat.get(now));
    assertEquals(msg, newMax, stat.getMax(now));
    assertEquals(msg, newMin, stat.getMin(now));

    now += 20;  // push into the next slots
  }

  // The next increment should cause old data to fall off.
  stat.incBy(1, now);
  assertEquals(2000 * 49 + 1, stat.get(now));
  assertEquals(1, stat.getMin(now));
  assertEquals(1049, stat.getMax(now));

  now += 20;  // drop off another bucket
  stat.incBy(1, now);
  assertEquals(2000 * 48 + 2, stat.get(now));
  assertEquals(1, stat.getMin(now));
  assertEquals(1049, stat.getMax(now));
}

function testSparseBuckets() {
  var stat = new goog.stats.BasicStat(1000);
  var now = 1000;

  stat.incBy(10, now);
  assertEquals(10, stat.get(now));

  now += 5000;  // the old slot is now still in memory, but should be ignored
  stat.incBy(1, now);
  assertEquals(1, stat.get(now));
}

function testFuzzy() {
  var stat = new goog.stats.BasicStat(1000);
  var test = new PerfectlySlowStat(1000);
  var rand = new goog.testing.PseudoRandom(58849020);
  var eventCount = 0;

  // test over 5 simulated seconds (2 for IE, due to timeouts)
  var simulationDuration = goog.userAgent.IE ? 2000 : 5000;
  for (var now = 1000; now < simulationDuration;) {
    var count = Math.floor(rand.random() * 2147483648);
    var delay = Math.floor(rand.random() * 25);
    for (var i = 0; i <= delay; ++i) {
      var time = now + i;
      var msg = goog.string.format('now=%d eventCount=%d', time, eventCount);
      var expected = test.getStats(now + i);
      assertEquals(expected.count, stat.get(time));
      assertEquals(expected.min, stat.getMin(time));
      assertEquals(expected.max, stat.getMax(time));
    }

    now += delay;
    stat.incBy(count, now);
    test.incBy(count, now);
    eventCount++;
  }
}



/**
 * A horribly inefficient implementation of BasicStat that stores
 * every event in an array and dynamically filters to perform
 * aggregations.
 * @constructor
 */
var PerfectlySlowStat = function(interval) {
  this.interval_ = interval;
  this.slotSize_ = Math.floor(interval / goog.stats.BasicStat.NUM_SLOTS_);
  this.events_ = [];
};

PerfectlySlowStat.prototype.incBy = function(amt, now) {
  this.events_.push({'time': now, 'count': amt});
};

PerfectlySlowStat.prototype.getStats = function(now) {
  var end = Math.floor(now / this.slotSize_) * this.slotSize_ + this.slotSize_;
  var start = end - this.interval_;
  var events = goog.array.filter(this.events_, function(e) {
    return e.time >= start;
  });
  return {
    'count': goog.array.reduce(
        events,
        function(sum, e) {
          return sum + e.count;
        },
        0),
    'min': goog.array.reduce(
        events,
        function(min, e) {
          return Math.min(min, e.count);
        },
        Number.MAX_VALUE),
    'max': goog.array.reduce(
        events,
        function(max, e) {
          return Math.max(max, e.count);
        },
        Number.MIN_VALUE)
  };
};
